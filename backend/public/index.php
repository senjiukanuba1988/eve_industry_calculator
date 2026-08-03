<?php

declare(strict_types=1);

use App\ItemCategoriesController;
use App\ItemsController;
use App\RecipesController;
use App\RecipeTypes;
use Slim\Factory\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

$app = AppFactory::create();

$app->get('/health', function ($request, $response) {
    $response->getBody()->write(json_encode(['status' => 'ok']));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->get('/recipe-types', function ($request, $response) {
    $response->getBody()->write(json_encode(RecipeTypes::all()));
    return $response->withHeader('Content-Type', 'application/json');
});

$app->get('/item-categories', [ItemCategoriesController::class, 'index']);
$app->post('/item-categories', [ItemCategoriesController::class, 'create']);
$app->patch('/item-categories/{id}', [ItemCategoriesController::class, 'update']);
$app->delete('/item-categories/{id}', [ItemCategoriesController::class, 'delete']);

$app->get('/items', [ItemsController::class, 'index']);
$app->post('/items', [ItemsController::class, 'create']);
$app->post('/items/resolve', [ItemsController::class, 'resolve']);
$app->get('/items/{id}', [ItemsController::class, 'show']);
$app->patch('/items/{id}', [ItemsController::class, 'update']);
$app->delete('/items/{id}', [ItemsController::class, 'delete']);
$app->get('/items/{id}/recipes', [ItemsController::class, 'recipes']);

$app->get('/recipes', [RecipesController::class, 'index']);
$app->post('/recipes', [RecipesController::class, 'create']);
$app->get('/recipes/{id}', [RecipesController::class, 'show']);
$app->post('/recipes/{id}/explode', [RecipesController::class, 'explode']);
$app->patch('/recipes/{id}', [RecipesController::class, 'update']);
$app->delete('/recipes/{id}', [RecipesController::class, 'delete']);

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
