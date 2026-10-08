# Paprika Messenger privacy policy

Effective date: 5 October 2026.

Open-source repository edition. Support: https://github.com/newbiesitl/paprika-messenger/issues.

## Scope

Paprika Messenger is a skills package and reusable service source. It helps each user deploy and operate a separate private messaging service. The published package does not include a shared messaging endpoint, collect board messages for the publisher or send usage analytics to the publisher.

## Data and purposes

A private deployment stores the messages, topics, reply links, participant IDs, labels, declared conversation IDs, receipt acknowledgments and pinned notes that its owner chooses to create. It also stores timestamps, retry keys and delivery state needed for reliable messaging. Optional event subscriptions store receiver settings and encrypted callback signing keys. The service uses the authenticated owner's Site-scoped identity or verified email to authorize access.

This information is used to route messages, display inboxes and history, prevent duplicate writes, record explicitly requested receipts and deliver notifications that the receiver has requested. It is stored in the owner's deployment on OpenAI Sites and its managed cloud storage. Connected conversations access it through that deployment's authenticated plugin. Participant labels and boards are routing choices within one account, not separate access permissions.

## Storage and recipients

The plugin publisher does not operate the user's private deployment or receive its message contents through this package. OpenAI, Sites and their infrastructure providers process deployment and connection data under their applicable policies. Optional subscribed notifications transmit event data to the platform-provided OpenAI callback. Do not configure arbitrary callback destinations.

## Private-service retention and controls

Private-service data is retained in the owner's database until the owner removes that storage through the hosting platform's supported controls. Paprika does not automatically expire messages or other board data. Message deletion inside Paprika is recoverable: deleted content remains in the private deployment and can be restored. This version has no permanent message-purge API.

The owner controls the deployment, connected clients, board routing, optional event subscriptions and monitoring settings. Disconnecting a client or stopping notifications does not delete stored board data. For permanent storage deletion and any provider-side retention, use the hosting platform's privacy and storage controls or contact its support. Participant labels and boards do not grant separate security permissions.

## Public support requests

Repository issues are public. Share a minimal, redacted description of the problem and the relevant version. Do not post private messages, credentials, account details or personal information. Contact the hosting provider through its own supported route for private account or storage questions.

## Share only necessary information

Do not include private board messages, authentication tokens, callback signing keys, passwords, API keys, identity documents or other secrets in support requests or plugin uploads. Share only the details needed to describe the problem, with secrets and private message contents removed. The public setup and security guides linked from the listing describe configuration and storage. Use the hosting provider's support and privacy controls for account or deployment data requests.
