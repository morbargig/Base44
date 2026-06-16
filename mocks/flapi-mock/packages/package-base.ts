import type { PackageMetadata, QuickParamDefinition } from '../schemas';

export interface MockPackageConfig {
  metadata: PackageMetadata;
  quickParams?: Record<string, QuickParamDefinition[]>;
  getResults: (quickParams: Record<string, unknown>) => Record<string, unknown>;
}

const hasValueProperty = (value: unknown): value is { Value: unknown } =>
  typeof value === 'object' && value !== null && 'Value' in value;

export class MockPackage {
  metadata: PackageMetadata;
  quickParams: Record<string, QuickParamDefinition[]>;
  private _getResults: (quickParams: Record<string, unknown>) => Record<string, unknown>;

  constructor(config: MockPackageConfig) {
    this.metadata = config.metadata;
    this.quickParams = config.quickParams || {};
    this._getResults = config.getResults;
  }

  get id(): number {
    return this.metadata.Id;
  }

  get name(): string {
    return this.metadata.Name;
  }

  get queries() {
    return this.metadata.Queries;
  }

  get description() {
    return this.metadata.Description;
  }

  validateAndApplyDefaults(providedParams: Record<string, unknown>): { params: Record<string, unknown> } | { error: string } {
    const allParamDefs: QuickParamDefinition[] = [];
    for (const queryParams of Object.values(this.quickParams)) {
      if (Array.isArray(queryParams)) {
        allParamDefs.push(...queryParams);
      }
    }

    const finalParams: Record<string, unknown> = { ...providedParams };

    // Apply defaults
    for (const paramDef of allParamDefs) {
      const paramName = paramDef.Name;
      const hasDefault = paramDef.Value && paramDef.Value.length > 0;

      if (!(paramName in providedParams) && hasDefault) {
        const defaultValues = paramDef.Value.map((v) => (hasValueProperty(v) ? v.Value : v));
        finalParams[paramName] = paramDef.IsSingleValue ? defaultValues[0] : defaultValues;
      }
    }

    // Validate required params
    for (const paramDef of allParamDefs) {
      const paramName = paramDef.Name;
      const isRequired = paramDef.IsRequired || false;

      if (isRequired && !(paramName in finalParams)) {
        return { error: `Required parameter '${paramName}' is missing` };
      }
    }

    // Validate requireAny - at least one of the group must be provided
    const requireAnyParams = allParamDefs.filter((p) => p.IsRequireAny);
    if (requireAnyParams.length > 0) {
      const hasAtLeastOne = requireAnyParams.some((p) => {
        const value = finalParams[p.Name];
        return value !== undefined && value !== null && (!Array.isArray(value) || value.length > 0);
      });

      if (!hasAtLeastOne) {
        const paramNames = requireAnyParams.map((p) => `'${p.Name}'`).join(', ');
        return { error: `At least one of these parameters is required: ${paramNames}` };
      }
    }

    return { params: finalParams };
  }

  getResults(quickParams: Record<string, unknown>): Record<string, unknown> {
    return this._getResults(quickParams);
  }
}

export interface QuickParamOptions {
  name: string;
  displayName?: string;
  // Quick-param types are PascalCase on the wire (FLAPI contract).
  type?: 'String' | 'Int' | 'Double' | 'Boolean' | 'DateTime' | 'Timestamp' | 'Haphoch';
  defaultValues?: (string | number | boolean)[];
  required?: boolean;
  requireAny?: boolean;
  singleValue?: boolean;
  description?: string;
}

export function quickParam(opts: QuickParamOptions): QuickParamDefinition {
  const name = opts.name;
  const displayName = opts.displayName || name.charAt(0).toUpperCase() + name.slice(1);
  const type = opts.type || 'String';
  // OntologyType narrowed on the FLAPI side — only TEXT is meaningful for
  // the scalar types we emit. Everything else is specialty (geo/PSTN/etc).
  const ontology = 'TEXT';

  return {
    Name: name,
    DisplayName: displayName,
    Description: opts.description || null,
    Type: type,
    OntologyType: ontology,
    IsSingleValue: opts.singleValue !== false,
    IsRequired: opts.required || false,
    IsRequireAny: opts.requireAny || false,
    Value: (opts.defaultValues || []).map((v) => ({ Name: String(v), Value: String(v) })),
  };
}

export function quickParamsQuery(
  queryId: string,
  params: QuickParamOptions[]
): Record<string, QuickParamDefinition[]> {
  return {
    [queryId]: params.map((p) => quickParam(p)),
  };
}

// FieldType is the schema-output vocabulary (lowercase + a couple of legacy
// tags). OntologyType was narrowed on the FLAPI side; only TEXT lines up
// with the scalar shapes we emit, so that's what we always send.
type FieldType = 'string' | 'int' | 'double' | 'bool' | 'datetime' | 'Haphoch' | 'wkt';
type OntologyType = 'TEXT' | 'GEOMETRY' | 'TOOLID' | 'PSTN' | 'IMEI' | 'IMSI' | 'TIME';

function inferFieldType(value: unknown): { fieldType: FieldType; ontologyType: OntologyType } {
  if (typeof value === 'number') {
    return { fieldType: Number.isInteger(value) ? 'int' : 'double', ontologyType: 'TEXT' };
  }
  if (typeof value === 'boolean') {
    return { fieldType: 'bool', ontologyType: 'TEXT' };
  }
  if (value instanceof Date || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value))) {
    return { fieldType: 'datetime', ontologyType: 'TEXT' };
  }
  return { fieldType: 'string', ontologyType: 'TEXT' };
}

export function buildQueriesFromData(
  data: Record<string, unknown>,
  packageId: number,
  packageName: string
): PackageMetadata['Queries'] {
  const queries: PackageMetadata['Queries'] = [];

  for (const [cubeName, value] of Object.entries(data)) {
    let sampleRow: Record<string, unknown> | null = null;

    if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
      sampleRow = value[0] as Record<string, unknown>;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      sampleRow = value as Record<string, unknown>;
    }

    if (sampleRow) {
      const fields = Object.entries(sampleRow).map(([fieldName, fieldValue]) => {
        const { fieldType, ontologyType } = inferFieldType(fieldValue);
        return {
          Name: fieldName,
          DisplayName: fieldName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          Type: fieldType,
          IsDynamic: false,
          Attributes: {
            OntologyType: ontologyType,
            OriginalOntologyType: ontologyType,
          },
          Description: null,
        };
      });

      queries.push({
        uniqueName: `query-${cubeName}-${packageId}`,
        originalName: cubeName,
        Name: cubeName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        ResultsLimit: 1000,
        DataSourceName: packageName,
        Description: `Query for ${cubeName}`,
        id: `query-${packageId}-${cubeName}`,
        Fields: fields,
      });
    }
  }

  return queries;
}

export function buildMetadata(
  id: number,
  name: string,
  data: Record<string, unknown>,
  options?: { description?: string }
): PackageMetadata {
  return {
    Id: id,
    Name: name,
    Description: options?.description || '',
    OutputQueriesId: [],
    Queries: buildQueriesFromData(data, id, name),
  };
}
