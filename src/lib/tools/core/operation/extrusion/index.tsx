import React from 'react';
import type { CADObject } from '../../../../../store/types';
import { normalizeExtrusionParams } from './logic';
import { renderExtrusionPreview as renderPreviewPrimitive } from './preview';

interface ExtrusionPreviewViewProps {
    params: Record<string, any>;
    context: {
        selectedIds: string[];
        objects: CADObject[];
        updateOperationParams: (params: Record<string, any>) => void;
        setCameraControlsDisabled: (disabled: boolean) => void;
    };
}

export function ExtrusionPreviewView({ params, context }: ExtrusionPreviewViewProps) {
    const normalized = normalizeExtrusionParams(params, context.selectedIds);
    return (
        <>
            {renderPreviewPrimitive({ ...params, ...normalized }, context)}
        </>
    );
}

export function renderExtrusionPreview(
    params: Record<string, any>,
    context: {
        selectedIds: string[];
        objects: CADObject[];
        updateOperationParams: (params: Record<string, any>) => void;
        setCameraControlsDisabled: (disabled: boolean) => void;
    },
) {
    return <ExtrusionPreviewView params={params} context={context} />;
}
