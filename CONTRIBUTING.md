# Contributing

Open a pull request for changes. The protected `main` branch requires the `validate` check, an up-to-date branch and resolved review conversations. Force pushes and deletion are blocked, including for administrators. No second-person approval is required by the initial solo-maintainer policy. Maintainers may add an approval requirement when collaborators join.

Use Node.js 24 or newer, run `npm ci`, `npm test`, `npm run build`, and the automated local pilot tests documented in its README. Keep fixtures separate from live deployment evidence. Never commit owner credentials, databases, callback secrets, message bodies from real conversations or receiver checkpoints.

The current local receiving prototype only controls its dedicated app-server-owned session. A fixture pass is not evidence of production readiness or ordinary desktop chat wake-up.

Plugin publication and Site deployment are separate from merging source; preserve each owner’s existing deployment identity when upgrading.
