-- Recalculates score of a user based on how many posts we have for them
CREATE OR REPLACE FUNCTION recalc_score ()
	RETURNS TRIGGER
	LANGUAGE PLPGSQL
	AS $$
BEGIN
	UPDATE users SET score = sub.count FROM (SELECT
	COUNT(id) as count
FROM
	posts
WHERE
	creator = NEW.creator) AS sub WHERE id = NEW.creator;
	RETURN NEW;
END
$$;

-- Recalculates ranks in the ranks table based on users score
CREATE OR REPLACE FUNCTION public.recalc_ranks()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO ranks (id, rank)
SELECT
  id,
  RANK() OVER (ORDER BY score DESC)
FROM
  users ON CONFLICT (id)
  DO
  UPDATE
  SET
    rank = EXCLUDED.rank;
  RETURN NEW;
END
$function$;