<?php

declare(strict_types=1);

use Phinx\Seed\AbstractSeed;

class RecipeDataSeeder extends AbstractSeed
{
    /**
     * Run Method.
     *
     * Write your database seeder using this method.
     *
     * More information on writing seeders is available here:
     * https://book.cakephp.org/phinx/0/en/seeding.html
     */
    public function run(): void
    {
        $dataFile = __DIR__ . '/recipe_data.sql';

        if (!file_exists($dataFile)) {
            return;
        }

        $pdo = $this->getAdapter()->getConnection();
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (['recipe_inputs', 'recipes', 'items', 'item_categories'] as $table) {
            $pdo->exec("TRUNCATE TABLE `{$table}`");
        }
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');

        $pdo->exec((string) file_get_contents($dataFile));
    }
}
