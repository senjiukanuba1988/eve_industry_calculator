<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ItemCategoriesController
{
    use JsonResponseHelpers;

    public function index(Request $request, Response $response): Response
    {
        $stmt = Db::connection()->query('SELECT id, name FROM item_categories ORDER BY name');
        $response->getBody()->write(json_encode($stmt->fetchAll()));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function create(Request $request, Response $response): Response
    {
        $name = $this->requireName($request, $response);
        if ($name instanceof Response) {
            return $name;
        }

        $pdo = Db::connection();

        try {
            $stmt = $pdo->prepare('INSERT INTO item_categories (name) VALUES (:name)');
            $stmt->execute(['name' => $name]);
        } catch (PDOException $e) {
            if ($this->isDuplicateKeyError($e)) {
                return $this->jsonError($response, 409, 'A category with this name already exists');
            }

            throw $e;
        }

        $id = (int) $pdo->lastInsertId();
        $response->getBody()->write(json_encode(['id' => $id, 'name' => $name]));

        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Db::connection();

        if (!$this->exists($pdo, $id)) {
            return $this->jsonError($response, 404, 'Category not found');
        }

        $name = $this->requireName($request, $response);
        if ($name instanceof Response) {
            return $name;
        }

        try {
            $stmt = $pdo->prepare('UPDATE item_categories SET name = :name WHERE id = :id');
            $stmt->execute(['name' => $name, 'id' => $id]);
        } catch (PDOException $e) {
            if ($this->isDuplicateKeyError($e)) {
                return $this->jsonError($response, 409, 'A category with this name already exists');
            }

            throw $e;
        }

        $response->getBody()->write(json_encode(['id' => $id, 'name' => $name]));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Db::connection();

        if (!$this->exists($pdo, $id)) {
            return $this->jsonError($response, 404, 'Category not found');
        }

        try {
            $stmt = $pdo->prepare('DELETE FROM item_categories WHERE id = :id');
            $stmt->execute(['id' => $id]);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                return $this->jsonError($response, 409, 'Category is still in use by one or more items');
            }

            throw $e;
        }

        return $response->withStatus(204);
    }

    /** Returns the trimmed name string, or a validation-error Response to short-circuit with. */
    private function requireName(Request $request, Response $response): string|Response
    {
        $data = $this->decodeBody($request);
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            return $this->jsonError($response, 422, 'name is required');
        }

        return $name;
    }

    private function exists(PDO $pdo, int $id): bool
    {
        $stmt = $pdo->prepare('SELECT 1 FROM item_categories WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return (bool) $stmt->fetchColumn();
    }

    private function isDuplicateKeyError(PDOException $e): bool
    {
        return (int) $e->getCode() === 23000 && str_contains($e->getMessage(), 'Duplicate entry');
    }
}
