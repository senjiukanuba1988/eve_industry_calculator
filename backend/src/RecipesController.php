<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class RecipesController
{
    use JsonResponseHelpers;

    public function index(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $sql = 'SELECT r.id, r.product_item_id, i.name AS product_item_name, r.recipe_type, r.variant_label, r.output_quantity
                FROM recipes r
                JOIN items i ON i.id = r.product_item_id
                WHERE 1 = 1';
        $bindings = [];

        if (isset($params['recipe_type']) && $params['recipe_type'] !== '') {
            $recipeType = (string) $params['recipe_type'];

            if (!RecipeTypes::isValid($recipeType)) {
                return $this->jsonError($response, 422, 'recipe_type must be one of: ' . implode(', ', RecipeTypes::values()));
            }

            $sql .= ' AND r.recipe_type = :recipe_type';
            $bindings['recipe_type'] = $recipeType;
        }

        if (isset($params['category_id']) && $params['category_id'] !== '') {
            $sql .= ' AND i.category_id = :category_id';
            $bindings['category_id'] = (int) $params['category_id'];
        }

        if (isset($params['search']) && trim((string) $params['search']) !== '') {
            $sql .= ' AND i.name LIKE :search';
            $bindings['search'] = '%' . trim((string) $params['search']) . '%';
        }

        $sql .= ' ORDER BY i.name, r.recipe_type, r.variant_label';

        $stmt = Db::connection()->prepare($sql);
        $stmt->execute($bindings);
        $response->getBody()->write(json_encode($stmt->fetchAll()));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $recipe = $this->findWithInputs(Db::connection(), (int) $args['id']);

        if ($recipe === null) {
            return $this->jsonError($response, 404, 'Recipe not found');
        }

        $response->getBody()->write(json_encode($recipe));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function explode(Request $request, Response $response, array $args): Response
    {
        $params = $request->getQueryParams();
        $runs = isset($params['runs']) ? (int) $params['runs'] : 0;

        if ($runs < 1) {
            return $this->jsonError($response, 422, 'runs must be a positive integer');
        }

        $pdo = Db::connection();
        $recipe = $this->findWithInputs($pdo, (int) $args['id']);

        if ($recipe === null) {
            return $this->jsonError($response, 404, 'Recipe not found');
        }

        try {
            $result = (new BomExploder($pdo))->explode($recipe, $runs);
        } catch (AmbiguousRecipeException $e) {
            return $this->jsonError($response, 422, $e->getMessage());
        }

        $itemIds = array_unique(array_merge(
            array_keys($result['base_materials']),
            array_keys($result['intermediates'])
        ));
        $itemNames = $this->namesForItemIds($pdo, $itemIds);

        $baseMaterials = [];
        foreach ($result['base_materials'] as $itemId => $quantity) {
            $baseMaterials[] = [
                'item_id' => $itemId,
                'item_name' => $itemNames[$itemId] ?? null,
                'quantity' => $quantity,
            ];
        }
        usort($baseMaterials, fn ($a, $b) => strcmp((string) $a['item_name'], (string) $b['item_name']));

        $intermediates = [];
        foreach ($result['intermediates'] as $itemId => $data) {
            $intermediates[] = [
                'item_id' => $itemId,
                'item_name' => $itemNames[$itemId] ?? null,
                'recipe_id' => $data['recipe_id'],
                'batches' => $data['batches'],
                'produced_quantity' => $data['produced_quantity'],
                'leftover_quantity' => $data['leftover_quantity'],
                'tier' => $data['tier'],
            ];
        }
        usort(
            $intermediates,
            fn ($a, $b) => $a['tier'] <=> $b['tier'] ?: strcmp((string) $a['item_name'], (string) $b['item_name'])
        );

        $payload = [
            'recipe_id' => $recipe['id'],
            'product_item_id' => $recipe['product_item_id'],
            'product_item_name' => $recipe['product_item_name'],
            'runs' => $runs,
            'produced_quantity' => $result['produced_quantity'],
            'base_materials' => $baseMaterials,
            'intermediates' => $intermediates,
        ];

        $response->getBody()->write(json_encode($payload));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function create(Request $request, Response $response): Response
    {
        $validated = $this->validate($this->decodeBody($request), $response);
        if ($validated instanceof Response) {
            return $validated;
        }

        $pdo = Db::connection();

        $conflict = $this->rejectIfMultiRecipeNotAllowed($pdo, $validated, $response, null);
        if ($conflict instanceof Response) {
            return $conflict;
        }

        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare(
                'INSERT INTO recipes (product_item_id, recipe_type, variant_label, output_quantity, notes)
                 VALUES (:product_item_id, :recipe_type, :variant_label, :output_quantity, :notes)'
            );
            $stmt->execute([
                'product_item_id' => $validated['product_item_id'],
                'recipe_type' => $validated['recipe_type'],
                'variant_label' => $validated['variant_label'],
                'output_quantity' => $validated['output_quantity'],
                'notes' => $validated['notes'],
            ]);
            $recipeId = (int) $pdo->lastInsertId();
            $this->replaceInputs($pdo, $recipeId, $validated['inputs']);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();

            return $this->handleWriteError($e, $response);
        }

        $recipe = $this->findWithInputs($pdo, $recipeId);
        $response->getBody()->write(json_encode($recipe));

        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Db::connection();

        if (!$this->exists($pdo, $id)) {
            return $this->jsonError($response, 404, 'Recipe not found');
        }

        $validated = $this->validate($this->decodeBody($request), $response);
        if ($validated instanceof Response) {
            return $validated;
        }

        $conflict = $this->rejectIfMultiRecipeNotAllowed($pdo, $validated, $response, $id);
        if ($conflict instanceof Response) {
            return $conflict;
        }

        $pdo->beginTransaction();

        try {
            $stmt = $pdo->prepare(
                'UPDATE recipes
                 SET product_item_id = :product_item_id, recipe_type = :recipe_type,
                     variant_label = :variant_label, output_quantity = :output_quantity, notes = :notes
                 WHERE id = :id'
            );
            $stmt->execute([
                'product_item_id' => $validated['product_item_id'],
                'recipe_type' => $validated['recipe_type'],
                'variant_label' => $validated['variant_label'],
                'output_quantity' => $validated['output_quantity'],
                'notes' => $validated['notes'],
                'id' => $id,
            ]);

            $pdo->prepare('DELETE FROM recipe_inputs WHERE recipe_id = :id')->execute(['id' => $id]);
            $this->replaceInputs($pdo, $id, $validated['inputs']);
            $pdo->commit();
        } catch (PDOException $e) {
            $pdo->rollBack();

            return $this->handleWriteError($e, $response);
        }

        $recipe = $this->findWithInputs($pdo, $id);
        $response->getBody()->write(json_encode($recipe));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Db::connection();

        if (!$this->exists($pdo, $id)) {
            return $this->jsonError($response, 404, 'Recipe not found');
        }

        // recipe_inputs rows cascade-delete with their parent recipe (ON DELETE CASCADE).
        $pdo->prepare('DELETE FROM recipes WHERE id = :id')->execute(['id' => $id]);

        return $response->withStatus(204);
    }

    /** @return array{product_item_id:int,recipe_type:string,variant_label:?string,output_quantity:int,notes:?string,inputs:array<int,array{input_item_id:int,input_quantity:int}>}|Response */
    private function validate(array $data, Response $response): array|Response
    {
        $productItemId = (int) ($data['product_item_id'] ?? 0);
        if ($productItemId <= 0) {
            return $this->jsonError($response, 422, 'product_item_id is required');
        }

        $recipeType = trim((string) ($data['recipe_type'] ?? ''));
        if (!RecipeTypes::isValid($recipeType)) {
            return $this->jsonError($response, 422, 'recipe_type must be one of: ' . implode(', ', RecipeTypes::values()));
        }

        $variantLabel = trim((string) ($data['variant_label'] ?? ''));
        $variantLabel = $variantLabel === '' ? null : $variantLabel;

        $outputQuantity = array_key_exists('output_quantity', $data) ? (int) $data['output_quantity'] : 1;
        if ($outputQuantity < 1) {
            return $this->jsonError($response, 422, 'output_quantity must be at least 1');
        }

        $notes = trim((string) ($data['notes'] ?? ''));
        $notes = $notes === '' ? null : $notes;

        $inputsRaw = $data['inputs'] ?? null;
        if (!is_array($inputsRaw) || $inputsRaw === []) {
            return $this->jsonError($response, 422, 'inputs must be a non-empty array');
        }

        $inputs = [];
        $seenItemIds = [];

        foreach ($inputsRaw as $inputRow) {
            if (!is_array($inputRow)) {
                return $this->jsonError($response, 422, 'each input must be an object with input_item_id and input_quantity');
            }

            $inputItemId = (int) ($inputRow['input_item_id'] ?? 0);
            $inputQuantity = (int) ($inputRow['input_quantity'] ?? 0);

            if ($inputItemId <= 0) {
                return $this->jsonError($response, 422, 'each input requires a valid input_item_id');
            }

            if ($inputQuantity < 1) {
                return $this->jsonError($response, 422, 'each input requires input_quantity of at least 1');
            }

            if ($inputItemId === $productItemId) {
                return $this->jsonError($response, 422, 'a recipe cannot use its own product as an input');
            }

            if (in_array($inputItemId, $seenItemIds, true)) {
                return $this->jsonError($response, 422, 'duplicate input_item_id in inputs');
            }

            $seenItemIds[] = $inputItemId;
            $inputs[] = ['input_item_id' => $inputItemId, 'input_quantity' => $inputQuantity];
        }

        return [
            'product_item_id' => $productItemId,
            'recipe_type' => $recipeType,
            'variant_label' => $variantLabel,
            'output_quantity' => $outputQuantity,
            'notes' => $notes,
            'inputs' => $inputs,
        ];
    }

    private function rejectIfMultiRecipeNotAllowed(PDO $pdo, array $validated, Response $response, ?int $excludeRecipeId): ?Response
    {
        if ($validated['recipe_type'] === 't2_industry') {
            return null;
        }

        $sql = 'SELECT COUNT(*) FROM recipes WHERE product_item_id = :product_item_id';
        $bindings = ['product_item_id' => $validated['product_item_id']];

        if ($excludeRecipeId !== null) {
            $sql .= ' AND id != :exclude_id';
            $bindings['exclude_id'] = $excludeRecipeId;
        }

        $stmt = $pdo->prepare($sql);
        $stmt->execute($bindings);

        if ((int) $stmt->fetchColumn() > 0) {
            return $this->jsonError(
                $response,
                409,
                'This product already has a recipe; only t2_industry recipes may have multiple variants per product'
            );
        }

        return null;
    }

    /** @param array<int,array{input_item_id:int,input_quantity:int}> $inputs */
    private function replaceInputs(PDO $pdo, int $recipeId, array $inputs): void
    {
        $stmt = $pdo->prepare(
            'INSERT INTO recipe_inputs (recipe_id, input_item_id, input_quantity) VALUES (:recipe_id, :input_item_id, :input_quantity)'
        );

        foreach ($inputs as $input) {
            $stmt->execute([
                'recipe_id' => $recipeId,
                'input_item_id' => $input['input_item_id'],
                'input_quantity' => $input['input_quantity'],
            ]);
        }
    }

    private function findWithInputs(PDO $pdo, int $id): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT r.id, r.product_item_id, i.name AS product_item_name, r.recipe_type, r.variant_label, r.output_quantity, r.notes
             FROM recipes r
             JOIN items i ON i.id = r.product_item_id
             WHERE r.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $recipe = $stmt->fetch();

        if ($recipe === false) {
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT ri.input_item_id, ii.name AS input_item_name, ri.input_quantity
             FROM recipe_inputs ri
             JOIN items ii ON ii.id = ri.input_item_id
             WHERE ri.recipe_id = :id
             ORDER BY ii.name'
        );
        $stmt->execute(['id' => $id]);
        $recipe['inputs'] = $stmt->fetchAll();

        return $recipe;
    }

    /** @param array<int,int> $itemIds @return array<int,string> */
    private function namesForItemIds(PDO $pdo, array $itemIds): array
    {
        if ($itemIds === []) {
            return [];
        }

        $placeholders = implode(',', array_fill(0, count($itemIds), '?'));
        $stmt = $pdo->prepare("SELECT id, name FROM items WHERE id IN ({$placeholders})");
        $stmt->execute(array_values($itemIds));

        $names = [];
        foreach ($stmt->fetchAll() as $row) {
            $names[(int) $row['id']] = $row['name'];
        }

        return $names;
    }

    private function exists(PDO $pdo, int $id): bool
    {
        $stmt = $pdo->prepare('SELECT 1 FROM recipes WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return (bool) $stmt->fetchColumn();
    }

    private function handleWriteError(PDOException $e, Response $response): Response
    {
        if ((int) $e->getCode() !== 23000) {
            throw $e;
        }

        if (str_contains($e->getMessage(), 'Duplicate entry')) {
            return $this->jsonError($response, 409, 'Duplicate input item in recipe inputs');
        }

        if (str_contains($e->getMessage(), 'foreign key constraint fails')) {
            return $this->jsonError($response, 422, 'product_item_id or an input_item_id does not reference an existing item');
        }

        throw $e;
    }
}
