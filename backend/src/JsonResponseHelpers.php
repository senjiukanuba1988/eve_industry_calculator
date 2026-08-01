<?php

declare(strict_types=1);

namespace App;

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

trait JsonResponseHelpers
{
    private function decodeBody(Request $request): array
    {
        $data = json_decode((string) $request->getBody(), true);

        return is_array($data) ? $data : [];
    }

    private function jsonError(Response $response, int $status, string $message): Response
    {
        $response->getBody()->write(json_encode(['error' => $message]));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
