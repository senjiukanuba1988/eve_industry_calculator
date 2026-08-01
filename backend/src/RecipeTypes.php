<?php

declare(strict_types=1);

namespace App;

final class RecipeTypes
{
    /** @return array<int, array{value: string, label: string}> */
    public static function all(): array
    {
        return require __DIR__ . '/../config/recipe_types.php';
    }

    /** @return string[] */
    public static function values(): array
    {
        return array_column(self::all(), 'value');
    }

    public static function isValid(string $type): bool
    {
        return in_array($type, self::values(), true);
    }
}
