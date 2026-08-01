#!/bin/sh
# Dumps the recipe reference data (item_categories, items, recipes, recipe_inputs)
# from the running mysql container into backend/db/seeds/recipe_data.sql, so it
# survives a `docker compose down -v` or a fresh checkout on another machine.
# Run from anywhere; requires the mysql container to be up (`docker compose up -d mysql`).
set -e
cd "$(dirname "$0")/.."

docker compose exec -T mysql mysqldump \
    -ueve -peve \
    --no-create-info --no-tablespaces --skip-add-locks --skip-comments --complete-insert \
    eve_industry item_categories items recipes recipe_inputs \
    > backend/db/seeds/recipe_data.sql

echo "Exported recipe data to backend/db/seeds/recipe_data.sql"
