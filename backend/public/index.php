<?php

declare(strict_types=1);

use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

$app->get('/health', function ($request, $response) {
    $response->getBody()->write(json_encode(['status' => 'ok']));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->get('/health/db', function ($request, $response) {
    try {
        $pdo = new PDO(
            sprintf(
                'mysql:host=%s;port=%s;dbname=%s',
                getenv('DB_HOST') ?: 'mysql',
                getenv('DB_PORT') ?: '3306',
                getenv('DB_NAME') ?: 'eve_industry'
            ),
            getenv('DB_USER') ?: 'eve',
            getenv('DB_PASSWORD') ?: 'eve',
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );
        $pdo->query('SELECT 1');
        $payload = ['status' => 'ok', 'db' => 'connected'];
    } catch (PDOException $e) {
        $response = $response->withStatus(500);
        $payload = ['status' => 'error', 'db' => $e->getMessage()];
    }

    $response->getBody()->write(json_encode($payload));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->run();
