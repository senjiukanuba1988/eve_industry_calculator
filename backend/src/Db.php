<?php

declare(strict_types=1);

namespace App;

use PDO;

final class Db
{
    private static ?PDO $pdo = null;

    public static function connection(): PDO
    {
        if (self::$pdo === null) {
            self::$pdo = new PDO(
                sprintf(
                    'mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4',
                    getenv('DB_HOST') ?: 'mysql',
                    getenv('DB_PORT') ?: '3306',
                    getenv('DB_NAME') ?: 'eve_industry'
                ),
                getenv('DB_USER') ?: 'eve',
                getenv('DB_PASSWORD') ?: 'eve',
                [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                ]
            );
        }

        return self::$pdo;
    }
}
