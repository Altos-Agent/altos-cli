# Wallet Vault Backup Warning

The Postgres database stores encrypted wallet material. The master key decrypts
that material.

Treat this combination as a wallet-compromise boundary:

- DB backup plus master key equals access to imported wallets.
- Store database backups and the master key in separate locations.
- Encrypt every database backup before moving it off-host.
- Restrict restore access to trusted operators only.
- Test restore with demo wallets before any server is considered ready.
- Never commit `.local/master.key`, mounted vault files, raw backups, or
  decrypted wallet exports.

For live funds, file/env based key storage is still a no-go. Use a reviewed
secret manager, KMS, OS keyring, or hardware-backed signing policy before
enabling live execution.
