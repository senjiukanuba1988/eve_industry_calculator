<?php

declare(strict_types=1);

namespace App;

use PDO;

/**
 * Recursively explodes a recipe's inputs down to base materials.
 *
 * Each item's demand is tracked through a single shared leftover ledger, so a
 * shortfall is always topped up with the minimum number of whole batches
 * needed at that moment. Regardless of the order items are visited in, the
 * ledger invariant (leftover always stays below one batch) means the total
 * batches run for an item converges to ceil(total demand / batch size) - the
 * same result as aggregating all demand up front and rounding once.
 */
final class BomExploder
{
    /** @var array<int, array{id:int, output_quantity:int, inputs:array<int,array{input_item_id:int,input_quantity:int}>}|null> */
    private array $recipeCache = [];

    /** @var array<int, int> item_id => leftover quantity on hand */
    private array $leftover = [];

    /** @var array<int, int> item_id => quantity on hand at the start, before anything was drawn from it */
    private array $hangarStock = [];

    /** @var array<int, int> item_id => cumulative gross demand, regardless of how it was covered */
    private array $totalDemand = [];

    /** @var array<int, int> item_id => cumulative base material quantity still needed after hangar netting */
    private array $baseMaterials = [];

    /** @var array<int, array{recipe_id:int, batches:int}> item_id => accumulated intermediate data */
    private array $intermediates = [];

    public function __construct(private PDO $pdo)
    {
    }

    /**
     * @param array{output_quantity:int, inputs:array<int,array{input_item_id:int,input_quantity:int}>} $rootRecipe
     * @param array<int, int> $hangar item_id => quantity already on hand, netted off demand before producing more
     * @return array{
     *     produced_quantity:int,
     *     base_materials:array<int,int>,
     *     intermediates:array<int,array{recipe_id:int,batches:int,produced_quantity:int,leftover_quantity:int,tier:int}>,
     *     hangar_usage:array<int,array{hangar_quantity:int,needed_quantity:int}>
     * }
     */
    public function explode(array $rootRecipe, int $runs, array $hangar = []): array
    {
        $this->hangarStock = $hangar;
        $this->leftover = $hangar;

        foreach ($rootRecipe['inputs'] as $input) {
            $this->need((int) $input['input_item_id'], (int) $input['input_quantity'] * $runs);
        }

        $tiers = [];
        $intermediates = [];
        foreach ($this->intermediates as $itemId => $data) {
            $outputQuantity = $this->recipeCache[$itemId]['output_quantity'] ?? 1;
            $intermediates[$itemId] = [
                'recipe_id' => $data['recipe_id'],
                'batches' => $data['batches'],
                'produced_quantity' => $data['batches'] * $outputQuantity,
                'leftover_quantity' => $this->leftover[$itemId] ?? 0,
                'tier' => $this->tierOf($itemId, $tiers),
            ];
        }

        // Reported for every resolved hangar item regardless of whether it was
        // needed at all, so a fully- (or over-) covered item is never just dropped.
        $hangarUsage = [];
        foreach ($this->hangarStock as $itemId => $stock) {
            $hangarUsage[$itemId] = [
                'hangar_quantity' => $stock,
                'needed_quantity' => $this->totalDemand[$itemId] ?? 0,
            ];
        }

        return [
            'produced_quantity' => $runs * (int) $rootRecipe['output_quantity'],
            'base_materials' => $this->baseMaterials,
            'intermediates' => $intermediates,
            'hangar_usage' => $hangarUsage,
        ];
    }

    private function need(int $itemId, int $quantityNeeded): void
    {
        $this->totalDemand[$itemId] = ($this->totalDemand[$itemId] ?? 0) + $quantityNeeded;

        $available = $this->leftover[$itemId] ?? 0;

        if ($available >= $quantityNeeded) {
            $this->leftover[$itemId] = $available - $quantityNeeded;

            return;
        }

        $shortfall = $quantityNeeded - $available;
        $recipe = $this->recipeFor($itemId);

        if ($recipe === null) {
            $this->leftover[$itemId] = 0;
            $this->baseMaterials[$itemId] = ($this->baseMaterials[$itemId] ?? 0) + $shortfall;

            return;
        }

        $outputQuantity = $recipe['output_quantity'];
        $batches = $outputQuantity === 1 ? $shortfall : (int) ceil($shortfall / $outputQuantity);

        $this->leftover[$itemId] = ($batches * $outputQuantity) - $shortfall;

        if (!isset($this->intermediates[$itemId])) {
            $this->intermediates[$itemId] = ['recipe_id' => $recipe['id'], 'batches' => 0];
        }
        $this->intermediates[$itemId]['batches'] += $batches;

        foreach ($recipe['inputs'] as $input) {
            $this->need((int) $input['input_item_id'], (int) $input['input_quantity'] * $batches);
        }
    }

    /**
     * Build tier: 0 for an intermediate whose recipe consumes only base materials,
     * otherwise 1 + the highest tier among its intermediate inputs. Used to order
     * the result so every intermediate is listed after everything it depends on.
     *
     * @param array<int, int> $tiers item_id => tier, memoized across calls
     */
    private function tierOf(int $itemId, array &$tiers): int
    {
        if (isset($tiers[$itemId])) {
            return $tiers[$itemId];
        }

        $highestInputTier = -1;
        foreach ($this->recipeCache[$itemId]['inputs'] ?? [] as $input) {
            $inputItemId = (int) $input['input_item_id'];

            if (isset($this->intermediates[$inputItemId])) {
                $highestInputTier = max($highestInputTier, $this->tierOf($inputItemId, $tiers));
            }
        }

        return $tiers[$itemId] = $highestInputTier + 1;
    }

    /** @return array{id:int, output_quantity:int, inputs:array<int,array{input_item_id:int,input_quantity:int}>}|null */
    private function recipeFor(int $itemId): ?array
    {
        if (array_key_exists($itemId, $this->recipeCache)) {
            return $this->recipeCache[$itemId];
        }

        $stmt = $this->pdo->prepare('SELECT id, output_quantity FROM recipes WHERE product_item_id = :item_id');
        $stmt->execute(['item_id' => $itemId]);
        $rows = $stmt->fetchAll();

        if ($rows === []) {
            return $this->recipeCache[$itemId] = null;
        }

        if (count($rows) > 1) {
            throw new AmbiguousRecipeException(
                "Item {$itemId} has multiple recipes and cannot be auto-expanded as an intermediate"
            );
        }

        $recipeId = (int) $rows[0]['id'];

        $stmt = $this->pdo->prepare('SELECT input_item_id, input_quantity FROM recipe_inputs WHERE recipe_id = :recipe_id');
        $stmt->execute(['recipe_id' => $recipeId]);

        return $this->recipeCache[$itemId] = [
            'id' => $recipeId,
            'output_quantity' => (int) $rows[0]['output_quantity'],
            'inputs' => $stmt->fetchAll(),
        ];
    }
}
