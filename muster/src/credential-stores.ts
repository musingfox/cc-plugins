// Home-relative paths the fenced worker's sandbox denies reading; the path policy asks before a file tool reads them.
export const CREDENTIAL_STORES = [
  ".npmrc",
  ".config/gh",
  ".git-credentials",
  ".config/git/credentials",
  ".netrc",
  ".aws",
  ".docker/config.json",
  "Library/Keychains",
  ".ssh",
  ".pi",
  ".config/gcloud",
  ".kube",
  ".cargo/credentials.toml",
  ".pypirc",
] as const;
