import { describe, expect, it } from 'vitest';
import {
    getImportAccept,
    getImportLabel,
    getImportedFileType,
    matchesImportFormat,
} from './import';

describe('storage import helpers', () => {
    it('returns the correct file picker filters for each format', () => {
        expect(getImportAccept()).toBe('.json,.stl,.step,.stp');
        expect(getImportAccept('json')).toBe('.json');
        expect(getImportAccept('step')).toBe('.step,.stp');
        expect(getImportAccept('stl')).toBe('.stl');
    });

    it('maps extensions to the expected imported file type', () => {
        expect(getImportedFileType('json')).toBe('JSON');
        expect(getImportedFileType('stp')).toBe('STEP');
        expect(getImportedFileType('step')).toBe('STEP');
        expect(getImportedFileType('stl')).toBe('STL');
        expect(getImportedFileType('txt')).toBeNull();
    });

    it('rejects mismatched formats when a specific import format is chosen', () => {
        expect(matchesImportFormat('json', 'json')).toBe(true);
        expect(matchesImportFormat('step', 'json')).toBe(false);
        expect(matchesImportFormat('stl', 'step')).toBe(false);
        expect(matchesImportFormat('stp', 'step')).toBe(true);
        expect(matchesImportFormat('json')).toBe(true);
    });

    it('uses readable labels for import format prompts', () => {
        expect(getImportLabel()).toBe('any supported');
        expect(getImportLabel('json')).toBe('JSON');
        expect(getImportLabel('step')).toBe('STEP');
        expect(getImportLabel('stl')).toBe('STL');
    });
});
