# Plugin icon and native-message diagnostics

Paprika Messenger supplies a root portable manifest and a matching compatibility
overlay, primary/composer PNG references, optional dark variants, and per-skill
icons resolved from each skill root. Source/package evidence is distinct from
catalog presentation and native rendering.

Run the read-only helper against the intended extracted or installed directory:

```sh
node plugin-public/skills/setup-paprika/scripts/inspect-plugin-presentation.mjs <plugin-root>
```

The shipped helper is at skills/setup-paprika/scripts/ in a prepared plugin. It
reports effective manifest source, relative asset paths, PNG dimensions/size and
SHA-256, missing/unsafe assets and shadowed overlay drift. It checks paths without
following symlinks and emits no machine path, credential or account identity.
It does not install, refresh or modify managed caches. Current Paprika assets are
PNG; another image format requires its own supported inspection rather than a
claim that these PNG checks certified it.

An object at root extensions.com.openai replaces the whole compatibility overlay
for OpenAI-specific settings. There is no field-by-field fallback: an empty root
object cannot borrow an overlay icon. Without that object, the compatibility
interface supplies presentation. Keep both synchronized for clients using either
format. Reordering equivalent fields is not a presentation difference.

When valid packaged icons still render as a fallback, use a minimal reproduction:

1. Retain the exact package/version and sanitized diagnostic report, including
   icon hashes and effective manifest precedence. Do not substitute another icon
   or copy managed files to make a result appear successful.
2. Through supported owner metadata, compare the current account release with
   the intended installed release. Equal version strings alone do not identify
   a release; record actual release IDs privately when available.
3. Compare the host's supported installed/catalog view. A missing search result,
   incomplete catalog response or unavailable metadata is not proof of a missing
   installation, icon, account scope or service connection.
4. Keep account IDs, actual references, machine paths and screenshots private.
   Record app/client version, surface (picker/listing/message badge), theme and
   whether a fresh chat reproduces the symptom. Use only supported refresh/update
   controls when the human requests them; preserve the working installation and
   service binding. Do not edit caches or bypass unavailable app access.
5. If package checks pass and a fallback persists, report a host presentation or
   propagation investigation with that evidence. State the causal uncertainty.
   A unit test, manifest comparison or account-wide installation is not UI proof.

The current implementation adds diagnostics and native message presentation; it
does not claim to fix an unexplained host picker fallback. Badge rendering is a
separate feature: supported plugin mentions can supply product branding in a
native prompt while leaving the host-owned sender heading unchanged. See
[message presentation](../skills/paprika-messenger/references/message-presentation.md).

For an installable review candidate without declaring a release published, call
preparePluginPackage with an explicit newer packageVersion. The report retains
source_plugin_version and service source version separately. Immutable releases
remain unchanged. An owner-neutral account kit must retain/merge the selected
owner's existing App binding through the existing supported merge workflow before
account replacement. Do not create a duplicate Messenger or backend App.

Sources: [OpenAI package precedence](https://developers.openai.com/plugins/build/plugins),
[icon requirements](https://developers.openai.com/plugins/deploy/submission),
[native plugin mention syntax](https://learn.chatgpt.com/docs/reference/commands).
