# monopi

The unscoped npm name for [@monopi/monopi](https://www.npmjs.com/package/@monopi/monopi). Installing this package gives you the same `npx monopi` entrypoint as `npx @monopi/monopi`.

```bash
npx monopi
```

This package is a thin alias. It depends on `@monopi/monopi` and re-exports its `monopi` binary, so the install command, options, and behavior are identical.

## Options

```bash
npx monopi                      # install latest versions (global)
npx monopi --version 0.2.13     # pin to a specific version
npx monopi --local              # install to project .pi/settings.json
npx monopi --remove             # uninstall all monopi packages from pi
```

See the [@monopi/monopi README](../monopi__monopi/README.md) for details.
