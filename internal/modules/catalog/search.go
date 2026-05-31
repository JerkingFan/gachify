package catalog

import "fmt"

// searchRankSQL returns a GREATEST(...) expression for pg_trgm relevance (query param index n).
func searchRankSQL(n int) string {
	q := fmt.Sprintf("$%d", n)
	return fmt.Sprintf(`GREATEST(
		similarity(t.title, %s),
		word_similarity(%s, u.display_name),
		word_similarity(%s, u.handle::text),
		similarity(COALESCE(t.gachi_metadata::text, ''), %s) * 0.35
	)`, q, q, q, q)
}

// searchWhereSQL filters tracks/creators matching query via pg_trgm % operator.
func searchWhereSQL(n int) string {
	q := fmt.Sprintf("$%d", n)
	return fmt.Sprintf(` AND (
		t.title %% %s
		OR u.display_name %% %s
		OR u.handle %% %s
		OR COALESCE(t.gachi_metadata::text, '') %% %s
	)`, q, q, q, q)
}
