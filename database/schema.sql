-- Users table
CREATE TABLE "public"."users" (
    "id" text NOT NULL,
    "score" int4 NOT NULL DEFAULT 0,
    "username" text NOT NULL,
    "name" text NOT NULL,
    "bio" text,
    "avatar" text,
    "hidden" bool NOT NULL DEFAULT false,
    PRIMARY KEY ("id")
);

-- Ranks table
CREATE TABLE "public"."ranks" (
    "id" text NOT NULL,
    "rank" int4 NOT NULL,
    CONSTRAINT "ranks_id_fkey" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- Posts table
CREATE TABLE "public"."posts" (
    "id" text NOT NULL,
    "creation_time" timestamp NOT NULL,
    "type" text NOT NULL DEFAULT 'GM'::text,
    "creator" text NOT NULL,
    CONSTRAINT "posts_creator_fkey" FOREIGN KEY ("creator") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

-- Run recalc_score() on new insert to posts
CREATE TRIGGER posts_calculate_user_score
	AFTER INSERT ON posts
	FOR EACH ROW
	EXECUTE PROCEDURE recalc_score ();

-- Run recalc_ranks() when users score changes
CREATE TRIGGER posts_recalc_user_rank
	AFTER UPDATE ON users
	FOR EACH ROW
	EXECUTE PROCEDURE recalc_ranks ();