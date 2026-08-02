# eve_industry_calculator
This is for producing complicated T2 blueprints in eve and checking how many materials are needed.

## Running the app

```
docker compose up -d
```

- Frontend: http://localhost:4200
- Backend API: http://localhost:8000
- Adminer (DB inspection): http://localhost:8080

On Windows with Git Bash, prefix `docker` commands with `MSYS_NO_PATHCONV=1` (Git Bash otherwise mangles container paths like `/app`).

The `mysql` data volume is disposable - the backend container runs pending DB migrations and re-seeds recipe data automatically on every start, so `docker compose down -v` (or a fresh checkout on another machine) followed by `docker compose up -d` fully reconstitutes the schema and recipe data with no manual steps.

## Recipe data (backend/db/seeds/recipe_data.sql)

Recipes entered through the app only live in the `mysql` container's volume until you export them. To make them part of the project (so they survive a volume wipe or travel with the repo to another machine):

```
scripts/export-recipe-data.sh
```

This dumps `item_categories`, `items`, `recipes`, and `recipe_inputs` into `backend/db/seeds/recipe_data.sql`. Commit that file - it's the actual source of truth for recipe data, not the Docker volume. Re-run the script any time you want to snapshot newly entered recipes; the next container start (or a manual `phinx seed:run`) will pick up the latest export.

Run it from anywhere like this:

```
& "C:\Program Files\Git\bin\bash.exe" "D:/PHPStormProjects/eve_industry_calculator/scripts/export-recipe-data.sh"
```

## Backend DB migrations (Phinx)

Schema changes go in `backend/db/migrations/` as Phinx migration classes. They run automatically on container start, but to run them manually (e.g. from inside the backend container):

```
php vendor/bin/phinx migrate -c phinx.php
```

After changing `backend/composer.json` (e.g. adding a dependency, or an autoload mapping), rebuild the backend image *and* force a fresh `vendor/` volume - `backend/vendor` is an anonymous Docker volume, not bind-mounted from the host, and by default Compose preserves anonymous volumes across a container recreate (to avoid data loss on things like DB volumes), so a plain rebuild + restart silently keeps the stale `vendor/`:

```
docker compose build backend
docker compose up -d --force-recreate --renew-anon-volumes backend
```
