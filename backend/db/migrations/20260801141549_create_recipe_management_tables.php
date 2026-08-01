<?php

declare(strict_types=1);

use Phinx\Migration\AbstractMigration;

final class CreateRecipeManagementTables extends AbstractMigration
{
    /**
     * Change Method.
     *
     * Write your reversible migrations using this method.
     *
     * More information on writing migrations is available here:
     * https://book.cakephp.org/phinx/0/en/migrations.html#the-change-method
     *
     * Remember to call "create()" or "update()" and NOT "save()" when working
     * with the Table class.
     */
    public function change(): void
    {
        $this->table('item_categories')
            ->addColumn('name', 'string', ['limit' => 255, 'null' => false])
            ->addIndex(['name'], ['unique' => true])
            ->create();

        $this->table('items')
            ->addColumn('name', 'string', ['limit' => 255, 'null' => false])
            ->addColumn('category_id', 'integer', ['null' => true, 'signed' => false])
            ->addIndex(['name'], ['unique' => true])
            ->addForeignKey('category_id', 'item_categories', 'id', ['delete' => 'RESTRICT', 'update' => 'CASCADE'])
            ->create();

        $this->table('recipes')
            ->addColumn('product_item_id', 'integer', ['null' => false, 'signed' => false])
            ->addColumn('recipe_type', 'enum', ['values' => ['t1_industry', 't2_industry', 'reaction', 'pi'], 'null' => false])
            ->addColumn('variant_label', 'string', ['limit' => 255, 'null' => true])
            ->addColumn('output_quantity', 'integer', ['null' => false, 'default' => 1])
            ->addColumn('notes', 'text', ['null' => true])
            ->addIndex(['product_item_id'])
            ->addForeignKey('product_item_id', 'items', 'id', ['delete' => 'RESTRICT', 'update' => 'CASCADE'])
            ->create();

        $this->table('recipe_inputs')
            ->addColumn('recipe_id', 'integer', ['null' => false, 'signed' => false])
            ->addColumn('input_item_id', 'integer', ['null' => false, 'signed' => false])
            ->addColumn('input_quantity', 'integer', ['null' => false])
            ->addIndex(['recipe_id', 'input_item_id'], ['unique' => true])
            ->addForeignKey('recipe_id', 'recipes', 'id', ['delete' => 'CASCADE', 'update' => 'CASCADE'])
            ->addForeignKey('input_item_id', 'items', 'id', ['delete' => 'RESTRICT', 'update' => 'CASCADE'])
            ->create();
    }
}
