-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow public read access to projects" ON public.projects;
DROP POLICY IF EXISTS "Allow all to insert projects" ON public.projects;
DROP POLICY IF EXISTS "Allow all to update projects" ON public.projects;
DROP POLICY IF EXISTS "Allow public read access to published extensions" ON public.extensions;
DROP POLICY IF EXISTS "Allow read access to own extensions" ON public.extensions;
DROP POLICY IF EXISTS "Allow all to insert extensions" ON public.extensions;
DROP POLICY IF EXISTS "Allow authors to update their extensions" ON public.extensions;

-- Drop old policies with different names
DROP POLICY IF EXISTS "Allow public read access" ON public.extensions;
DROP POLICY IF EXISTS "Allow authenticated users to insert" ON public.extensions;
DROP POLICY IF EXISTS "Allow authenticated users to update" ON public.extensions;

-- Drop existing tables (this will remove all data!)
-- If you want to preserve data, use ALTER TABLE instead
DROP TABLE IF EXISTS public.projects CASCADE;
DROP TABLE IF EXISTS public.extensions CASCADE;

-- Projects table: Only store GitHub references and stats
-- Actual metadata (name, description) is read from GitHub
CREATE TABLE public.projects (
    id TEXT PRIMARY KEY,
    github_owner TEXT NOT NULL,
    github_repo TEXT NOT NULL,
    is_public BOOLEAN DEFAULT true,
    views INTEGER DEFAULT 0,
    stars INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(github_owner, github_repo, id)
);

-- Extensions table: Only store GitHub references and stats
-- Actual metadata (name, description, icon, version) is read from manifest.json in GitHub
CREATE TABLE public.extensions (
    id TEXT PRIMARY KEY,
    github_owner TEXT NOT NULL,
    github_repo TEXT NOT NULL,
    author TEXT NOT NULL,
    status TEXT DEFAULT 'development' CHECK (status IN ('development', 'published')),
    downloads INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    dislikes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(github_owner, github_repo, id)
);

-- Enable Row Level Security
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Allow public read access to projects" ON public.projects
    FOR SELECT USING (is_public = true);

CREATE POLICY "Allow all to insert projects" ON public.projects
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow all to update projects" ON public.projects
    FOR UPDATE USING (true);

-- Extensions policies
CREATE POLICY "Allow public read access to published extensions" ON public.extensions
    FOR SELECT USING (status = 'published');

CREATE POLICY "Allow read access to own extensions" ON public.extensions
    FOR SELECT USING (author = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Allow all to insert extensions" ON public.extensions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authors to update their extensions" ON public.extensions
    FOR UPDATE USING (author = current_setting('request.jwt.claims', true)::json->>'email');

-- Indexes for searching
CREATE INDEX IF NOT EXISTS projects_github_idx ON public.projects (github_owner, github_repo);
CREATE INDEX IF NOT EXISTS extensions_github_idx ON public.extensions (github_owner, github_repo);
CREATE INDEX IF NOT EXISTS extensions_status_idx ON public.extensions (status);
