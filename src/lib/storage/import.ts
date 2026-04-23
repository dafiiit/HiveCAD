export type ImportFormat = 'all' | 'json' | 'step' | 'stl';

export type ImportedFileType = 'JSON' | 'STEP' | 'STL';

const IMPORT_ACCEPT_BY_FORMAT: Record<ImportFormat, string> = {
    all: '.json,.stl,.step,.stp',
    json: '.json',
    step: '.step,.stp',
    stl: '.stl',
};

const IMPORT_FORMAT_LABEL: Record<Exclude<ImportFormat, 'all'>, string> = {
    json: 'JSON',
    step: 'STEP',
    stl: 'STL',
};

export const getImportAccept = (format: ImportFormat = 'all') => IMPORT_ACCEPT_BY_FORMAT[format];

export const getImportLabel = (format: ImportFormat = 'all') => {
    if (format === 'all') {
        return 'any supported';
    }

    return IMPORT_FORMAT_LABEL[format];
};

export const getImportedFileType = (extension: string): ImportedFileType | null => {
    const normalized = extension.toLowerCase();

    if (normalized === 'json') return 'JSON';
    if (normalized === 'stl') return 'STL';
    if (normalized === 'step' || normalized === 'stp') return 'STEP';

    return null;
};

export const matchesImportFormat = (extension: string, format: ImportFormat = 'all') => {
    if (format === 'all') {
        return true;
    }

    const normalized = extension.toLowerCase();
    if (format === 'json') return normalized === 'json';
    if (format === 'stl') return normalized === 'stl';
    if (format === 'step') return normalized === 'step' || normalized === 'stp';

    return true;
};
