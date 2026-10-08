# Security policy

## Report a vulnerability privately

Use GitHub's [private vulnerability reporting](https://github.com/newbiesitl/paprika-messenger/security/advisories/new) to contact the repository owner about a suspected security vulnerability. From the repository's Security tab, choose **Report a vulnerability**.

Public issues and pull requests are visible to everyone. Do not put exploit details, credentials, private messages, account identifiers, callback secrets, or receiver checkpoints in them. Ordinary setup problems and non-security bugs belong in [support](SUPPORT.md) or a public issue with redacted diagnostics.

Include the affected plugin/service version or commit, the expected security boundary, potential impact, and a minimal reproduction using a deployment you control and invented data. Remove secrets and private content from attachments. Test only systems you own or have permission to test.

## Supported source

Security fixes are developed against the current `main` branch and included in subsequent releases when available. Older snapshots do not receive independent backports. Update to the release containing a fix once it is available.

The local receiving pilot under `experiments/` is experimental and is separate from the installed plugin. Fixture tests do not establish production readiness.

## Handling reports

[@newbiesitl](https://github.com/newbiesitl) reviews reports on a best-effort basis; this project does not promise a response time or security bounty. Use the private advisory thread to coordinate reproduction, a fix, and disclosure. Avoid publishing vulnerability details before a fix or coordinated disclosure is agreed.

Each deployment belongs to its operator. Report hosting-account, billing, or platform vulnerabilities to the relevant provider. For the service's authentication, routing, storage, and trust boundaries, see [security architecture](docs/SECURITY.md).
