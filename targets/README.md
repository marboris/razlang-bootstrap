# Target Profiles

Target profiles describe how RIR is lowered to a particular native toolchain configuration. They are intentionally separate from the Raz language definition.

Current profiles:

- `cpp11.target.json`
- `cpp14.target.json`
- `cpp17.target.json`
- `cpp20.target.json`
- `cpp23.target.json`

The current backend deliberately uses a conservative C++ feature set, so the same RIR can be emitted for these language modes. Future backend-specific features may require capability flags or separate lowering rules.

Run the compatibility smoke test with:

```bash
npm run test:targets
```
