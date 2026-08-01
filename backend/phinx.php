<?php

declare(strict_types=1);

return [
    'paths' => [
        'migrations' => __DIR__ . '/db/migrations',
        'seeds' => __DIR__ . '/db/seeds',
    ],
    'environments' => [
        'default_migration_table' => 'phinxlog',
        'default_environment' => 'development',
        'development' => [
            'adapter' => 'mysql',
            'host' => getenv('DB_HOST') ?: 'mysql',
            'name' => getenv('DB_NAME') ?: 'eve_industry',
            'user' => getenv('DB_USER') ?: 'eve',
            'pass' => getenv('DB_PASSWORD') ?: 'eve',
            'port' => getenv('DB_PORT') ?: '3306',
            'charset' => 'utf8mb4',
        ],
    ],
    'version_order' => 'creation',
];
