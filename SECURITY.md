# Security policy

Gridla is a pure layout library: it does not perform network requests, read
storage, or evaluate untrusted code. Its attack surface is limited to
pathological inputs (for example, very large item counts or non-finite
numbers) that could degrade performance.

## Supported versions

The latest minor release receives fixes. Older `0.x` minors are not patched.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through GitHub's
"Report a vulnerability" form on the repository's Security tab, or by email to
wintercounter@gmail.com. Include a minimal reproduction. You will receive an
acknowledgement within seven days and a fix or mitigation plan within thirty.
