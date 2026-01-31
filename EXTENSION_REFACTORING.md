# Extension & Project Storage Refactoring

## Changes Summary

### 1. **Eliminated Data Duplication**
Instead of storing complete metadata in Supabase, we now:
- Store only **GitHub references** (owner, repo, ID) and **statistics** (downloads, likes, status)
- Read actual content (names, descriptions, icons) from **manifest files in GitHub**

### 2. **Standardized Folder Structure**

#### Extensions:
```
extensions/
  {extension-id}/
    manifest.json  ← Contains name, description, icon, version
    README.md
    index.ts       ← Extension code
    thumbnail.png  ← (optional)
```

#### Projects:
```
projects/
  {project-id}/
    .hivecad/
      project.json ← Contains name, description, metadata
      thumbnail.png
```

### 3. **Development Workflow**

Extensions now have two states:
- **`development`**: Work in progress, visible only to the author
- **`published`**: Ready for community, visible to everyone

Authors can toggle status via a button in the Extension Card UI.

### 4. **GitHub Integration**

When creating an extension:
1. **Creates folder structure** on GitHub automatically
2. **Generates template files** (manifest.json, README.md, index.ts)
3. **Stores reference** in Supabase with status='development'
4. **Redirects** user to GitHub folder to continue editing

### 5. **Updated Supabase Schema**

Run this SQL in your Supabase dashboard:

\`\`\`sql
-- Projects table: Only GitHub refs + stats
CREATE TABLE IF NOT EXISTS public.projects (
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

-- Extensions table: Only GitHub refs + stats
CREATE TABLE IF NOT EXISTS public.extensions (
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

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extensions ENABLE ROW LEVEL SECURITY;

-- Policies for extensions
CREATE POLICY "Allow public read published" ON public.extensions
    FOR SELECT USING (status = 'published');

CREATE POLICY "Allow read own extensions" ON public.extensions
    FOR SELECT USING (author = current_setting('request.jwt.claims', true)::json->>'email');

CREATE POLICY "Allow insert extensions" ON public.extensions
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow authors to update" ON public.extensions
    FOR UPDATE USING (author = current_setting('request.jwt.claims', true)::json->>'email');
\`\`\`

### 6. **Benefits**

✅ **Single source of truth**: GitHub stores the actual content  
✅ **No sync issues**: Metadata is always current  
✅ **Better version control**: All changes tracked in Git  
✅ **Cleaner database**: Supabase only stores references  
✅ **Developer workflow**: Direct GitHub editing after creation  
✅ **Status management**: Clear development vs published states  

## Next Steps

1. Run the updated `supabase_setup.sql` in your Supabase dashboard
2. Test creating a new extension - it should create a GitHub folder
3. Verify you can toggle between development/published states
4. Check that only published extensions appear in the community library
