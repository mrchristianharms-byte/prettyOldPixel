▲ / Is Agentic  mrchristianharms-byte.github.io/prettyOldPixel

  █████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    14 / 100
                                          Agents are likely to struggle
                                          10 failed · 2 partial

SCORE BREAKDOWN
  Essential         10 / 80    0 / 4 passed
  Recommended      3.7 / 20    1 / 9 passed
  Bonus                  +0    0 positive signals

FAILURES (10)

1. FAIL · ESSENTIAL  Not blocked by bot detection
   Evidence  Could not test bot user agents
   Fix       Verify that major agent User-Agents can reach the homepage. If your WAF or
             bot rules block them, remove or narrow the blocking rule. Add an allow rule
             only when your security setup denies them by default.

2. FAIL · ESSENTIAL  Content without JavaScript
   Evidence  Could not fetch homepage
   Fix       Serve at least 500 characters of meaningful homepage content in raw HTML.
             Add a clear H1, keep deeper heading levels sequential, and remove excessive
             non-content markup. Inner pages need their main text in the raw HTML too,
             not only after JavaScript runs.

3. FAIL · ESSENTIAL  Markdown content negotiation (acceptmarkdown.com)
   Evidence  Homepage https://mrchristianharms-byte.github.io does not meet the Markdown
             negotiation requirements: Accept: text/markdown returned text/html;
             charset=utf-8; Vary header missing Accept (got "accept-encoding")
   Fix       Enable Markdown negotiation on the scanned homepage. Supporting it only on
             /docs or a separate .md URL does not satisfy this check. Requests with
             Accept: text/markdown must receive a nonempty Markdown body with
             Content-Type: text/markdown and Vary: Accept. Keep serving HTML for Accept:
             text/html. Adding Vary alone does not create a Markdown response. Verify
             both with `curl -sS -L -i -H 'Accept: text/markdown'
             https://yourdomain.com/` and `curl -sS -L -i -H 'Accept: text/html'
             https://yourdomain.com/`. Check the final response headers and body:
             Markdown with Vary: Accept for the first request, HTML for the second.

4. FAIL · RECOMMENDED  Brand name discoverability
   Evidence  mrchristianharms-byte.github.io was not in the top 10 for "github"
             (searched your brand name alone: we could not read a product term from your
             site)
   Fix       Make sure your own domain ranks in the top results when people search your
             brand together with your main product (for example "Acme payments API"). If
             it does not, your brand may be too generic, conflict with a more
             established term, or not yet indexed. Strengthen it by describing your main
             product clearly in your homepage title and headings, earning press mentions
             that link to your domain, and avoiding redirect chains that mask your main
             domain in search results.

5. FAIL · RECOMMENDED  Agent instruction / when-to-use
   Evidence  No agent instruction file with when-to-use guidance found
   Fix       Tell agents when to reach for you: add a 'when to use this' section to your
             llms.txt (or a dedicated agent-instructions file) that names your best-fit
             use cases and how an agent should call you. Be specific about the jobs you
             are right for - generic marketing copy does not read as guidance.

6. FAIL · RECOMMENDED  Sitemap exists
   Evidence  No sitemap found
   Fix       Add a valid XML sitemap at /sitemap.xml listing all indexable URLs. Include
             lastmod dates and keep it under 50MB.

7. FAIL · RECOMMENDED  Trust anchor pages
   Evidence  No trust anchor pages found with sufficient content (About, Contact,
             Privacy)
   Fix       Publish real /about, /contact, and /privacy pages with at least 500
             characters of content each. These are the pages AI agents check to verify
             your business is legitimate before recommending you.

8. FAIL · RECOMMENDED  JSON-LD structured data
   Evidence  Could not fetch homepage
   Fix       Add JSON-LD structured data to your homepage using the identity type that
             matches your site - SoftwareApplication for products, Organization or
             LocalBusiness for companies, Person for personal sites, Article for blogs -
             with name, description, url, and type-appropriate fields (offers, sameAs,
             author) so AI can parse your identity programmatically.

9. FAIL · RECOMMENDED  Metadata completeness
   Evidence  Could not fetch homepage
   Fix       Add all four signals to your homepage: <link rel="canonical">, <html
             lang="...">, <meta property="og:image">, and <meta property="og:type">.
             Agents use these for entity resolution and attribution.

10. FAIL · RECOMMENDED  Organization schema completeness
   Evidence  Could not fetch homepage
   Fix       Add Organization JSON-LD that includes both contactPoint (with email/phone
             and contactType) and address (PostalAddress). This lets AI verify your
             business legitimacy and answer contact queries.

PARTIAL (2)

11. PARTIAL · ESSENTIAL  Agent-friendly 404s
   Evidence  The nonexistent path
             https://mrchristianharms-byte.github.io/__ora-404-probe-r45716oa correctly
             returns HTTP 404. Partial credit: no Markdown error body was detected.
   Fix       Keep the correct HTTP 404 status. The remaining requirement is a Markdown
             error body when agents request Accept: text/markdown. Include at least 20
             characters explaining the error and a link to your docs, sitemap, or
             llms.txt. Verify with `curl -sS -L -i -H 'Accept: text/markdown'
             https://yourdomain.com/some-path-that-does-not-exist`. Check both the final
             404 status and the Markdown body with Content-Type: text/markdown. Checking
             the status alone does not verify the missing requirement.

12. PARTIAL · RECOMMENDED  MCP server / manifest
   Evidence  Verified MCP server in registry with usage (Smithery, github, 6059 uses,
             verified) but no live protocol handshake - add /.well-known/mcp for full
             credit.
   Fix       Build an MCP (Model Context Protocol) server exposing your API as tools.
             Use Streamable HTTP transport for full score. This lets Claude, ChatGPT,
             and other AI agents call your product natively.

REPORT
  URL      https://is-agentic.com/scan/mrchristianharms-byte.github.io/prettyOldPixel
  Scanned  2026-10-30T15:49:25.694Z
  Checks   13 eligible
