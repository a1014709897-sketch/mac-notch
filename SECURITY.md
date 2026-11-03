# Security

Do not attach credentials, auth.json, browser cookies, session transcripts, private paths or unredacted account screenshots to public issues. Report a vulnerability privately through the repository owner's GitHub contact or enable GitHub private vulnerability reporting before inviting reports. There is no dedicated security email yet.

The app is a local reader with network access only for subscription quotas. It does not provide a remote control API. Never add unrestricted renderer IPC, remote script execution or configurable credential-bearing API destinations.

Development artifacts are not Developer ID notarized releases. Review the release document before public binary distribution.
