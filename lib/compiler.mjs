import { parse } from './parser.mjs';
import {
  FIELD_UNKNOWN,
  FIELD_INT32,
  FIELD_UINT32,
  FIELD_SINT32,
  FIELD_INT64,
  FIELD_UINT64,
  FIELD_SINT64,
  FIELD_BOOL,
  FIELD_ENUM,
  FIELD_FIXED32,
  FIELD_SFIXED32,
  FIELD_FLOAT,
  FIELD_FIXED64,
  FIELD_SFIXED64,
  FIELD_DOUBLE,
  FIELD_STRING,
  FIELD_BYTES,
  FIELD_MESSAGE,
} from './constants.mjs';

class CompilerError extends Error {
  constructor(message, node) {
    super(`${message} at ${node.loc.start.line}:${node.loc.start.column}`);
  }
}

class Scope extends Map {
  resolve(path, name) {
    if (name.length === 1) {
      const global = GLOBAL_SCOPE.get(name[0]);
      if (global !== undefined) {
        return name;
      }
    }

    // From the most to the least qualified path
    for (let i = path.length; i >= 0; i--) {
      const resolved = path.slice(0, i).concat(name);
      if (super.has(resolved.join('.'))) {
        return resolved;
      }
    }
  }

  get(path) {
    if (path.length === 1) {
      const global = GLOBAL_SCOPE.get(path[0]);
      if (global !== undefined) {
        return global;
      }
    }

    return super.get(path.join('.'));
  }
}

const GLOBAL_SCOPE = new Map([
  ['int32', FIELD_INT32],
  ['uint32', FIELD_UINT32],
  ['sint32', FIELD_SINT32],
  ['int64', FIELD_INT64],
  ['uint64', FIELD_UINT64],
  ['sint64', FIELD_SINT64],
  ['bool', FIELD_BOOL],
  ['fixed32', FIELD_FIXED32],
  ['sfixed32', FIELD_SFIXED32],
  ['float', FIELD_FLOAT],
  ['fixed64', FIELD_FIXED64],
  ['sfixed64', FIELD_SFIXED64],
  ['double', FIELD_DOUBLE],
  ['string', FIELD_STRING],
  ['bytes', FIELD_BYTES],
]);

const SUPPORTED_SYNTAX = new Set(['proto2', 'proto3']);

const SUPPORTED_FILE_OPTIONS = new Set([
  'java_package',
  'java_outer_classname',
  'java_multiple_files',
  'swift_prefix',
  'optimize_for',
  'cc_enable_arenas',
  'deprecated',
]);

const SUPPORTED_MESSAGE_OPTIONS = new Set([]);

const SUPPORTED_PROTO2_FIELD_OPTIONS = new Set(['default']);
const SUPPORTED_PROTO3_FIELD_OPTIONS = new Set([]);

const SUPPORTED_ENUM_OPTIONS = new Set([
  'allow_alias', // TODO(indutny): implement me
]);

export function compile(sources) {
  const roots = sources.map(source => parse(source));

  const rootInfo = new Map();

  const source = [];
  const typedefs = [];

  const scope = new Scope();

  source.push('const $EMPTY_BYTES = new Uint8Array(0);');
  typedefs.push(
    'type $DeepPartial<Value> = Value extends Record<string, unknown> ?',
    '  { [key in keyof Value]?: $DeepPartial<Value[key]>} : Value;'
  );

  // First pass: evaluate global configuration, populate scope
  for (const root of roots) {
    const options = new Map();

    let pkg;
    let syntax = 'proto2';
    for (const node of root) {
      switch (node.kind) {
        case 'syntax':
          if (!SUPPORTED_SYNTAX.has(node.value)) {
            throw new CompilerError(`Unsupported syntax ${node.value}`, node);
          }
          syntax = node.value;
          break;
        case 'package':
          pkg = node.name;
          break;
        case 'option':
          if (!SUPPORTED_FILE_OPTIONS.has(node.name)) {
            throw new CompilerError(`Unsupported option: ${node.name}`, node);
          }
          options.set(node.name, node.value);
          break;
        case 'message':
        case 'enum': {
          let path;
          if (pkg === undefined) {
            path = node.name;
          } else {
            path = `${pkg.join('.')}.${node.name}`;
          }
          let field;
          if (node.kind === 'message') {
            field = FIELD_MESSAGE;
          } else {
            field = FIELD_ENUM;
          }
          traverseScope(node, field, scope, path);
          break;
        }
        default:
          throw new CompilerError(
            `Unexpected root AST node: ${node.kind}`,
            node
          );
      }
    }

    rootInfo.set(root, { pkg, syntax });
  }

  // Second pass: translate messages/enums
  const internal = new Map();
  const exports = new Map();
  for (const [root, { pkg, syntax }] of rootInfo) {
    let target = exports;
    for (const key of pkg) {
      typedefs.push(`export namespace ${key} {`);
      let next = target.get(key);
      if (next === undefined) {
        next = new Map();
        target.set(key, next);
      }
      target = next;
    }

    for (const node of root) {
      switch (node.kind) {
        case 'message':
        case 'enum': {
          let path;
          if (pkg === undefined) {
            path = [node.name];
          } else {
            path = [pkg, node.name].flat();
          }

          let result;
          if (node.kind === 'message') {
            result = translateMessage(node, syntax, scope, path);
            for (const [key, value] of result.globals) {
              internal.set(key, value);
            }
          } else {
            result = translateEnum(node, syntax);
          }
          target.set(node.name, result.source.join('\n'));
          typedefs.push(result.typedefs.join('\n'));
          break;
        }
        default:
          // Ignore
          break;
      }
    }

    // Close namespaces
    // eslint-disable-next-line no-unused-vars
    for (const _ of pkg) {
      typedefs.push('}');
    }
  }

  function flattenExports(value) {
    if (typeof value === 'string') {
      return value;
    }

    const out = ['{'];
    for (const [key, child] of value) {
      out.push(`  ${key}: ${flattenExports(child)},`);
    }
    out.push('}');
    return out.join('\n');
  }

  for (const [name, value] of internal) {
    source.push(`const ${name} = ${value};`);
  }
  for (const [name, value] of exports) {
    source.push(`export const ${name} = ${flattenExports(value)};`);
  }

  return { source: source.join('\n'), typedefs: typedefs.join('\n') };
}

function traverseScope(node, fieldType, scope, path) {
  if (scope.has(path)) {
    throw new CompilerError(`Duplicate definition of: ${path}`, node);
  }
  if (GLOBAL_SCOPE.has(path)) {
    throw new CompilerError(`Redefinition of global type of: ${path}`, node);
  }
  scope.set(path, fieldType);

  for (const child of node.children) {
    if (child.kind === 'message') {
      traverseScope(child, FIELD_MESSAGE, scope, `${path}.${child.name}`);
    } else if (child.kind === 'enum') {
      traverseScope(child, FIELD_ENUM, scope, `${path}.${child.name}`);
    }
  }
}

function getFieldTypedef(field, type, name, isNullable) {
  switch (type) {
    case FIELD_INT32:
    case FIELD_UINT32:
    case FIELD_SINT32:
    case FIELD_FIXED32:
    case FIELD_SFIXED32:
    case FIELD_FLOAT:
    case FIELD_DOUBLE:
      return ['number'];
    case FIELD_INT64:
    case FIELD_UINT64:
    case FIELD_SINT64:
    case FIELD_FIXED64:
    case FIELD_SFIXED64:
      return ['bigint'];
    case FIELD_BOOL:
      return ['boolean'];
    case FIELD_ENUM:
      return [name.join('.'), 'number'];
    case FIELD_STRING:
      return ['string'];
    case FIELD_BYTES:
      return ['Uint8Array'];
    case FIELD_MESSAGE:
      if (isNullable) {
        return [name.join('.'), 'undefined'];
      } else {
        return [name.join('.')];
      }
    default:
      throw new CompilerError(`Unexpected field type: ${type}`, field);
  }
}

function translateMessage(node, syntax, scope, path) {
  const options = new Map();

  const source = ['{'];
  const messageTypedef = new Map([['$unknown', ['Array<Uint8Array>']]]);
  const typedefs = [`export namespace ${node.name} {`];

  // First pass: options
  for (const child of node.children) {
    switch (child.kind) {
      case 'option':
        if (!SUPPORTED_MESSAGE_OPTIONS.has(node.name)) {
          throw new CompilerError(`Unsupported option: ${node.name}`, node);
        }
        options.set(child.name, child.value);
        break;
      case 'message':
      case 'enum':
      case 'field':
      case 'reserved':
      case 'oneof':
        // Ignore
        break;
      default:
        throw new CompilerError(
          `Unexpected message child: ${child.kind}`,
          child
        );
    }
  }

  // Second pass: children, message spec, template
  const spec = [];
  const globals = new Map();
  const fieldsWithParents = [];
  const template = ['$unknown: []'];
  for (const child of node.children) {
    switch (child.kind) {
      case 'message': {
        const childPath = path.concat(child.name);
        const result = translateMessage(child, syntax, scope, childPath);
        source.push(`  ${child.name}: ${result.source.join('\n')},`);
        typedefs.push(result.typedefs.join('\n'));
        for (const [key, value] of result.globals) {
          globals.set(key, value);
        }
        break;
      }
      case 'enum': {
        const result = translateEnum(child, syntax);
        source.push(`  ${child.name}: ${result.source.join('\n')},`);
        typedefs.push(result.typedefs.join('\n'));
        break;
      }
      case 'field': {
        const fieldTypedef = [];
        messageTypedef.set(child.name, fieldTypedef);
        fieldsWithParents.push({
          parent: node,
          field: child,
          fieldTypedef,
        });
        break;
      }
      case 'oneof': {
        const fieldTypedef = ['undefined'];
        template.push(`${child.name}: undefined`);
        messageTypedef.set(child.name, fieldTypedef);

        for (const field of child.children) {
          fieldsWithParents.push({
            parent: child,
            field,
            fieldTypedef,
          });
        }
        break;
      }
      case 'reserved':
        // Ignore
        break;
      default:
        break;
    }
  }

  const fieldNames = new Set();
  const fieldIds = new Set();
  const decoders = [];
  for (const { parent, field, fieldTypedef } of fieldsWithParents) {
    if (fieldNames.has(field.name)) {
      throw new CompilerError(`Duplicate field name: ${field.name}`, field);
    }
    fieldNames.add(field.name);

    if (fieldIds.has(field.id)) {
      throw new CompilerError(`Duplicate field id: ${field.id}`, field);
    }
    fieldIds.add(field.id);

    const resolvedField = scope.resolve(path, field.type);
    if (resolvedField === undefined) {
      throw new CompilerError(`Unknown type: ${field.type.join('.')}`, field);
    }
    const type = scope.get(resolvedField);
    if (type === undefined) {
      throw new CompilerError(`Unknown type: ${field.type.join('.')}`, field);
    }

    let supportedOptions;
    if (syntax === 'proto2') {
      supportedOptions = SUPPORTED_PROTO2_FIELD_OPTIONS;
    } else if (syntax === 'proto3') {
      supportedOptions = SUPPORTED_PROTO3_FIELD_OPTIONS;
    } else {
      throw new Error(`Unsupported syntax: ${syntax}`);
    }

    const options = new Map();
    if (field.options) {
      for (const option of field.options) {
        if (!supportedOptions.has(option.name)) {
          throw new CompilerError(`Unsupported option: ${option.name}`, option);
        }
        if (options.has(option.name)) {
          throw new CompilerError(`Duplicate option: ${option.name}`, option);
        }
        options.set(option.name, option.value);
      }
    }

    for (let i = spec.length; i < field.id - 1; i++) {
      spec.push(FIELD_UNKNOWN);
    }
    spec[field.id - 1] = type;

    const isOneof = parent.kind === 'oneof';
    const isRepeated = field.modifier === 'repeated';

    let defaultValue;
    if (isOneof) {
      const variants = getFieldTypedef(field, type, resolvedField, true);
      fieldTypedef.push(
        `{ kind: '${field.name}', value: ${variants.join(' | ')} }`
      );
      // Template populated once per parent above
    } else if (isRepeated) {
      const variants = getFieldTypedef(field, type, resolvedField, false);
      fieldTypedef.push(`Array<${variants.join(' | ')}>`);
      template.push(`${field.name}: []`);
    } else {
      defaultValue = options.get('default');
      fieldTypedef.push(...getFieldTypedef(field, type, resolvedField, true));
      switch (type) {
        case FIELD_INT32:
        case FIELD_UINT32:
        case FIELD_SINT32:
        case FIELD_FIXED32:
        case FIELD_SFIXED32:
        case FIELD_FLOAT:
        case FIELD_DOUBLE:
          if (defaultValue === undefined) {
            defaultValue = '0';
          } else if (typeof defaultValue === 'number') {
            defaultValue = defaultValue.toString();
          } else {
            throw new CompilerError('Invalid default value', field);
          }
          break;
        case FIELD_INT64:
        case FIELD_UINT64:
        case FIELD_SINT64:
        case FIELD_FIXED64:
        case FIELD_SFIXED64:
          if (defaultValue === undefined) {
            defaultValue = '0n';
          } else if (typeof defaultValue === 'bigint') {
            defaultValue = `${defaultValue}n`;
          } else {
            throw new CompilerError('Invalid default value', field);
          }
          break;
        case FIELD_BOOL:
          if (defaultValue === undefined) {
            defaultValue = 'false';
          } else if (typeof defaultValue === 'boolean') {
            defaultValue = defaultValue.toString();
          } else {
            throw new CompilerError('Invalid default value', field);
          }
          break;
        case FIELD_ENUM:
          if (defaultValue !== undefined) {
            throw new CompilerError('Unsupported enum default value', field);
          }
          defaultValue = '0';
          break;
        case FIELD_STRING:
          if (defaultValue === undefined) {
            defaultValue = '0';
          } else if (typeof defaultValue === 'string') {
            defaultValue = JSON.stringify(defaultValue);
          } else {
            throw new CompilerError('Invalid default value', field);
          }
          break;
        case FIELD_BYTES:
          if (defaultValue !== undefined) {
            throw new CompilerError('Unsupported bytes default value', field);
          }
          defaultValue = '$EMPTY_BYTES';
          break;
        case FIELD_MESSAGE:
          if (defaultValue !== undefined) {
            throw new CompilerError('Unsupported default value', field);
          }
          defaultValue = 'undefined';
          break;
        default:
          throw new CompilerError(`Unexpected field type: ${type}`, field);
      }
      template.push(`${field.name}: ${defaultValue}`);
    }

    decoders.push(`        case ${field.id}:`);

    let fieldValue;
    if (type === FIELD_MESSAGE) {
      fieldValue =
        `${resolvedField.join('.')}.` + 'decode(data, value.start, value.end)';
    } else {
      fieldValue = 'value';
    }

    if (isOneof) {
      decoders.push(`          res.${parent.name} = {`);
      decoders.push(`            kind: '${field.name}',`);
      decoders.push(`            value: ${fieldValue},`);
      decoders.push(`          };`);
    } else if (isRepeated) {
      decoders.push(`          res.${field.name}.push(${fieldValue});`);
    } else {
      decoders.push(`          res.${field.name} = ${fieldValue};`);
    }
    decoders.push('          break;');
  }

  const specVarName = `${path.join('_')}$SPEC`;
  globals.set(specVarName, JSON.stringify(spec));

  typedefs.push(`  export function decode(data: Uint8Array): ${node.name};`);
  typedefs.push(
    `  export function encode(data: $DeepPartial<${node.name}>): Uint8Array;`
  );

  source.push(`  decode(data, start, end) {`, `    const res = {`);
  for (const t of template) {
    source.push(`      ${t},`);
  }
  source.push(
    '    };',
    `    $decode(data, ${specVarName}, (id, value) => {`,
    '      switch (id) {'
  );
  for (const d of decoders) {
    source.push(d);
  }

  source.push(
    '        default:',
    '          res.$unknown.push(value);',
    '          break;',
    '      }',
    '    }, start, end);',
    '    return res;',
    '  }',
    '}'
  );
  typedefs.push('}');

  // TODO(indutny): encode (with buffer and offset)

  typedefs.push(`export type ${node.name} = {`);
  for (const [name, types] of messageTypedef) {
    typedefs.push(`  ${name}: ${types.join(' | ')};`);
  }
  typedefs.push('};');

  return { source, typedefs, globals };
}

function translateEnum(node, syntax) {
  const options = new Map();

  // First pass: options
  for (const child of node.children) {
    switch (child.kind) {
      case 'option':
        if (!SUPPORTED_ENUM_OPTIONS.has(child.name)) {
          throw new CompilerError(`Unsupported option: ${child.name}`, node);
        }
        options.set(child.name, child.value);
        break;
      default:
        break;
    }
  }

  const source = ['{'];
  const typedefs = [`export enum ${node.name} {`];

  let hasZero = false;

  // Second pass: children
  const knownValues = new Set();
  for (const child of node.children) {
    switch (child.kind) {
      case 'value':
        if (child.id === 0) {
          hasZero = true;
        }
        if (knownValues.has(child.name)) {
          throw new CompilerError(`Duplicate enum value ${child.name}`, child);
        }
        knownValues.add(child.name);
        source.push(`  ${child.name}: ${child.id},`);
        source.push(`  ${child.id}: '${child.name}',`);
        typedefs.push(`  ${child.name} = ${child.id},`);
        break;
      case 'reserved':
        // Ignore
        break;
      default:
        break;
    }
  }

  if (!hasZero) {
    if (syntax === 'proto2') {
      if (knownValues.has('UNKNOWN')) {
        throw new CompilerError(`Invalid unknown value for ${node.name}`, node);
      }
      source.push('  UNKNOWN: 0,');
      source.push(`  0: 'UNKNOWN',`);
      typedefs.push('  UNKNOWN = 0,');
    } else if (syntax === 'proto3') {
      throw new CompilerError(`Enum ${node.name} is missing 0 value`, node);
    } else {
      throw new Error(`Unknown syntax: ${syntax}`);
    }
  }

  source.push('}');
  typedefs.push('}');

  return {
    source,
    typedefs,
  };
}
