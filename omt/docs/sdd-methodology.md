# Skeleton-Driven Development (SDD) Methodology

## Core Philosophy

**Human defines skeleton, AI fills implementation.**

SDD separates development into distinct layers where humans make high-value architectural decisions while AI handles implementation details. This reduces hallucination risk and ensures human control over critical design choices.

## Three-Layer Model

### L1: Architecture Layer (Human)

**Owner**: Human
**Artifacts**: Interfaces, types, contracts, data structures

The human defines the "skeleton" of the system:
- API contracts and interfaces
- Data structures and types
- Integration points
- Error conditions and edge cases

**Example**:
```typescript
interface AuthService {
  login(credentials: LoginCredentials): Promise<AuthToken>;
  logout(token: string): Promise<void>;
  validateToken(token: string): Promise<boolean>;
}
```

### L2: Logic Layer (Human + AI Collaboration)

**Owner**: Human reviews, AI drafts
**Artifacts**: Pseudocode for complex functions

For functions with ≥3 logic branches, AI drafts pseudocode that human must approve:

```pseudocode
function login(email, password):
  // Validate input
  if email is empty OR password is empty:
    throw InvalidCredentialsError

  // Look up user
  user = database.findByEmail(email)
  if user does not exist:
    throw InvalidCredentialsError

  // Verify password
  if NOT bcrypt.verify(password, user.passwordHash):
    throw InvalidCredentialsError

  // Generate tokens
  return { accessToken, refreshToken, expiresIn }
```

**Human Review Options**:
- **Approve (Y)**: Pseudocode becomes binding for implementation
- **Modify (M)**: Human edits pseudocode, modified version is binding
- **Skip (S)**: No L2 constraint for this function

### L3: Implementation Layer (AI)

**Owner**: AI
**Artifacts**: Working code, tests

AI translates approved L2 pseudocode into working code:
- Each pseudocode line → one code block
- Each conditional → one test case
- Deviations must be documented

## Execution Strategies

### Interface Lock Protocol

Before ANY implementation:

1. **Input Contract Lock**: Define exact input types and validation rules
2. **Output Contract Lock**: Define exact return types and error conditions
3. **Human Approval Gate**: Explicitly confirm contracts before proceeding

If contracts are unclear or missing, **STOP** and request clarification.

### Blind Box Context Principle

AI should request ONLY information needed for current step:

- Do not ask for unrelated context
- Do not make assumptions about unavailable data
- If context seems insufficient, ask before proceeding

This reduces hallucination risk by limiting the scope of AI reasoning.

### Pseudocode as Contract

Approved L2 pseudocode is a **contract**, not a **cage**:

| Rule | Description |
|------|-------------|
| MUST follow | Every line of approved pseudocode must be implemented |
| MAY add | Optimizations not in pseudocode are allowed (document as deviation) |
| MUST report | Deviations must be explicitly documented |

### Pseudocode to Test Case Mapping

Each conditional in pseudocode becomes a test case:

```
function login(email, password):
  if email is empty → Test: "should reject empty email"
  if user not found → Test: "should reject nonexistent user"
  if password invalid → Test: "should reject invalid password"
  [success] → Test: "should return tokens for valid credentials"
```

## Quality Metrics

### Token-to-Code Ratio

Measures efficiency of AI code generation:

```
Ratio = Useful Code Lines / Total Tokens Used
```

Higher ratio indicates more focused, efficient generation.

### Human Intervention Density

Measures how often human needs to correct AI output:

```
Density = Human Corrections / Total AI Outputs
```

Lower density indicates better AI understanding of L1/L2 contracts.

### Architecture Entropy

Measures deviation from original L1 contracts:

```
Entropy = Unplanned Changes / Planned Changes
```

Lower entropy indicates faithful implementation of the skeleton.

### Deviation Reporting

AI must self-report any deviations from L2 pseudocode:

```markdown
Note: I deviated from L2 pseudocode at step X because [reason].
Original: "redis.set(token, userId, ttl=7days)"
Actual: "redis.setex(token, 604800, userId)" (using setex for atomic ttl)
```

## Integration with OMT

SDD is integrated into OMT workflow:

| OMT Agent | SDD Layer | Responsibility |
|-----------|-----------|----------------|
| @pm | - | Requirements gathering |
| @arch | L1, L2 | Define contracts + draft pseudocode |
| @dev | L3 | Implement from pseudocode |
| @reviewer | - | Verify L2 compliance |

### @arch Phase 3.5

After defining API contracts (Phase 3), @arch drafts L2 pseudocode for complex functions and requests human approval.

### @dev Phase 2.5

Before writing tests (Phase 3), @dev reads approved L2 pseudocode from `.agents/outputs/arch.md` and derives test cases.

### @dev Step 2.5 (Debugging)

When debugging, @dev first checks if implementation matches L2 pseudocode. Divergence is likely the root cause.

## When to Use SDD

### Recommended For

- Complex business logic (≥3 branches)
- Security-sensitive operations
- Financial calculations
- State machines
- Workflow orchestration

### Not Needed For

- Simple CRUD operations
- Getter/setter methods
- Configuration loading
- Straightforward mappings

## Future Independence Path

If SDD needs to become a standalone plugin:

1. Extract this document as `sdd-workflow/README.md`
2. Create `/define-skeleton` command based on @arch Phase 3.5 logic
3. Create `skeleton-guard` skill based on @dev Phase 2.5 checks
4. Add to marketplace.json as separate plugin

---

*This methodology is integrated into OMT workflow but documented separately for potential future independence.*
