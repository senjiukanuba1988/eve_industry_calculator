<?php

declare(strict_types=1);

namespace App;

use PDO;
use PDOException;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

final class ItemsController
{
    use JsonResponseHelpers;

    public function index(Request $request, Response $response): Response
    {
        $params = $request->getQueryParams();
        $sql = 'SELECT i.id, i.name, i.category_id, c.name AS category_name
                FROM items i
                LEFT JOIN item_categories c ON c.id = i.category_id
                WHERE 1 = 1';
        $bindings = [];

        if (isset($params['category_id']) && $params['category_id'] !== '') {
            $sql .= ' AND i.category_id = :category_id';
            $bindings['category_id'] = (int) $params['category_id'];
        }

        if (isset($params['search']) && trim((string) $params['search']) !== '') {
            $sql .= ' AND i.name LIKE :search';
            $bindings['search'] = '%' . trim((string) $params['search']) . '%';
        }

        $sql .= ' ORDER BY i.name';

        $stmt = Db::connection()->prepare($sql);
        $stmt->execute($bindings);
        $response->getBody()->write(json_encode($stmt->fetchAll()));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function show(Request $request, Response $response, array $args): Response
    {
        $item = $this->findWithCategory(Db::connection(), (int) $args['id']);

        if ($item === null) {
            return $this->jsonError($response, 404, 'Item not found');
        }

        $response->getBody()->write(json_encode($item));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function create(Request $request, Response $response): Response
    {
        $data = $this->decodeBody($request);
        $name = trim((string) ($data['name'] ?? ''));

        if ($name === '') {
            return $this->jsonError($response, 422, 'name is required');
        }

        $pdo = Db::connection();

        try {
            $stmt = $pdo->prepare('INSERT INTO items (name, category_id) VALUES (:name, :category_id)');
            $stmt->execute(['name' => $name, 'category_id' => $this->normalizeCategoryId($data)]);
        } catch (PDOException $e) {
            return $this->handleWriteError($e, $response);
        }

        $item = $this->findWithCategory($pdo, (int) $pdo->lastInsertId());
        $response->getBody()->write(json_encode($item));

        return $response->withHeader('Content-Type', 'application/json')->withStatus(201);
    }

    public function update(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Db::connection();

        if (!$this->exists($pdo, $id)) {
            return $this->jsonError($response, 404, 'Item not found');
        }

        $data = $this->decodeBody($request);
        $fields = [];
        $bindings = ['id' => $id];

        if (array_key_exists('name', $data)) {
            $name = trim((string) $data['name']);

            if ($name === '') {
                return $this->jsonError($response, 422, 'name cannot be empty');
            }

            $fields[] = 'name = :name';
            $bindings['name'] = $name;
        }

        if (array_key_exists('category_id', $data)) {
            $fields[] = 'category_id = :category_id';
            $bindings['category_id'] = $this->normalizeCategoryId($data);
        }

        if ($fields === []) {
            return $this->jsonError($response, 422, 'No fields to update');
        }

        try {
            $stmt = $pdo->prepare('UPDATE items SET ' . implode(', ', $fields) . ' WHERE id = :id');
            $stmt->execute($bindings);
        } catch (PDOException $e) {
            return $this->handleWriteError($e, $response);
        }

        $item = $this->findWithCategory($pdo, $id);
        $response->getBody()->write(json_encode($item));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function delete(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Db::connection();

        if (!$this->exists($pdo, $id)) {
            return $this->jsonError($response, 404, 'Item not found');
        }

        try {
            $stmt = $pdo->prepare('DELETE FROM items WHERE id = :id');
            $stmt->execute(['id' => $id]);
        } catch (PDOException $e) {
            if ((int) $e->getCode() === 23000) {
                return $this->jsonError($response, 409, 'Item is still referenced by one or more recipes');
            }

            throw $e;
        }

        return $response->withStatus(204);
    }

    public function recipes(Request $request, Response $response, array $args): Response
    {
        $id = (int) $args['id'];
        $pdo = Db::connection();

        if (!$this->exists($pdo, $id)) {
            return $this->jsonError($response, 404, 'Item not found');
        }

        $stmt = $pdo->prepare(
            'SELECT id, recipe_type, variant_label, output_quantity, notes
             FROM recipes WHERE product_item_id = :id ORDER BY recipe_type, variant_label'
        );
        $stmt->execute(['id' => $id]);
        $response->getBody()->write(json_encode($stmt->fetchAll()));

        return $response->withHeader('Content-Type', 'application/json');
    }

    public function resolve(Request $request, Response $response): Response
    {
        $data = $this->decodeBody($request);
        $names = $data['names'] ?? null;

        if (!is_array($names) || $names === []) {
            return $this->jsonError($response, 422, 'names must be a non-empty array');
        }

        $pdo = Db::connection();
        $stmt = $pdo->prepare(
            'SELECT i.id, i.category_id, c.name AS category_name
             FROM items i LEFT JOIN item_categories c ON c.id = i.category_id
             WHERE i.name = :name'
        );

        $results = [];

        foreach ($names as $rawName) {
            $name = trim((string) $rawName);

            if ($name === '') {
                $results[] = ['name' => $rawName, 'matched' => false];
                continue;
            }

            $stmt->execute(['name' => $name]);
            $row = $stmt->fetch();

            if ($row === false) {
                $results[] = ['name' => $name, 'matched' => false];
                continue;
            }

            $results[] = [
                'name' => $name,
                'matched' => true,
                'id' => (int) $row['id'],
                'category_id' => $row['category_id'] !== null ? (int) $row['category_id'] : null,
                'category_name' => $row['category_name'],
            ];
        }

        $response->getBody()->write(json_encode($results));

        return $response->withHeader('Content-Type', 'application/json');
    }

    private function normalizeCategoryId(array $data): ?int
    {
        $categoryId = $data['category_id'] ?? null;

        return ($categoryId === null || $categoryId === '') ? null : (int) $categoryId;
    }

    private function findWithCategory(PDO $pdo, int $id): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT i.id, i.name, i.category_id, c.name AS category_name
             FROM items i LEFT JOIN item_categories c ON c.id = i.category_id
             WHERE i.id = :id'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        return $row === false ? null : $row;
    }

    private function exists(PDO $pdo, int $id): bool
    {
        $stmt = $pdo->prepare('SELECT 1 FROM items WHERE id = :id');
        $stmt->execute(['id' => $id]);

        return (bool) $stmt->fetchColumn();
    }

    private function handleWriteError(PDOException $e, Response $response): Response
    {
        if ((int) $e->getCode() !== 23000) {
            throw $e;
        }

        if (str_contains($e->getMessage(), 'Duplicate entry')) {
            return $this->jsonError($response, 409, 'An item with this name already exists');
        }

        if (str_contains($e->getMessage(), 'foreign key constraint fails')) {
            return $this->jsonError($response, 422, 'category_id does not reference an existing category');
        }

        throw $e;
    }
}
