# Validate this service

Bundled service version 0.6.0-rc.3. In a new workspace, run `npm ci`, `npm test` and `npm run build`. Tests exercise the service, migrations, generated Worker, event delivery and messaging helpers with local fixtures. They do not establish another account's deployment, client connection or agent wake-up. Verify each intended client through its authenticated service connection.
