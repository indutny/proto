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
} from './decoder.mjs';

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

  const out = [];
  const typedefs = [];

  const scope = new Scope();

  out.push('const $EMPTY_BYTES = new Uint8Array(0);');

  const globalPackages = new Set();

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

    if (pkg !== undefined && !globalPackages.has(pkg[0])) {
      globalPackages.add(pkg[0]);

      let initializer = '{}';
      for (let i = pkg.length - 1; i > 0; i--) {
        initializer = `{ ${pkg[i]}: ${initializer} }`;
      }
      out.push(`export const ${pkg[0]} = ${initializer};`);
    }

    rootInfo.set(root, { pkg, syntax });
  }

  // Second pass: translate messages/enums
  for (const [root, { pkg, syntax }] of rootInfo) {
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
          if (node.kind === 'message') {
            translateMessage(node, syntax, scope, path, out, typedefs);
          } else {
            translateEnum(node, syntax, path, out, typedefs);
          }
          break;
        }
        default:
          // Ignore
          break;
      }
    }
  }

  return { source: out.join('\n'), typedefs: typedefs.join('\n') };
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

function translateMessage(node, syntax, scope, path, source, typedefs) {
  const options = new Map();

  const varName = path.join('.');
  if (path.length === 1) {
    source.push(`export const ${path[0]} = {};`);
  } else {
    source.push(`${path.join('.')} = {};`);
  }

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
  const fieldsWithParents = [];
  const template = ['$unknown: []'];
  for (const child of node.children) {
    switch (child.kind) {
      case 'message':
        translateMessage(
          child,
          syntax,
          scope,
          path.concat(child.name),
          source,
          typedefs
        );
        break;
      case 'enum':
        translateEnum(child, syntax, path.concat(child.name), source, typedefs);
        break;
      case 'field':
        fieldsWithParents.push({
          parent: node,
          field: child,
        });
        break;
      case 'oneof':
        template.push(`${child.name}: undefined`);

        for (const field of child.children) {
          fieldsWithParents.push({
            parent: child,
            field,
          });
        }
        break;
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
  for (const { parent, field } of fieldsWithParents) {
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
      // Template populated once per parent above
    } else if (isRepeated) {
      template.push(`${field.name}: []`);
    } else {
      defaultValue = options.get('default');
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

    decoders.push(`      case ${field.id}:`);

    let fieldValue;
    if (type === FIELD_MESSAGE) {
      fieldValue =
        `${resolvedField.join('.')}.` + 'decode(data, value.start, value.end)';
    } else {
      fieldValue = 'value';
    }

    if (isOneof) {
      decoders.push(`        res.${parent.name} = {`);
      decoders.push(`          kind: '${field.name}',`);
      decoders.push(`          value: ${fieldValue},`);
      decoders.push(`        };`);
    } else if (isRepeated) {
      decoders.push(`        res.${field.name}.push(${fieldValue});`);
    } else {
      decoders.push(`        res.${field.name} = ${fieldValue};`);
    }
    decoders.push('        break;');
  }

  const specVarName = `${path.join('_')}$SPEC`;
  source.push(
    `const ${specVarName} = ${JSON.stringify(spec)};`,
    `${varName}.decode = (data, start, end) => {`,
    `  const res = {`
  );
  for (const t of template) {
    source.push(`    ${t},`);
  }
  source.push(
    '  };',
    `  $decode(data, ${specVarName}, (id, value) => {`,
    '    switch (id) {'
  );
  for (const d of decoders) {
    source.push(d);
  }

  source.push(
    '      default:',
    '        res.$unknown.push(value);',
    '        break;',
    '    }',
    '  }, start, end);'
  );

  source.push('  return res;', '}');
}

function translateEnum(node, syntax, path, source, typedefs) {
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

  if (path.length === 1) {
    source.push(`export const ${path[0]} = {`);
  } else {
    source.push(`${path.join('.')} = {`);
  }

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
    } else if (syntax === 'proto3') {
      throw new CompilerError(`Enum ${node.name} is missing 0 value`, node);
    } else {
      throw new Error(`Unknown syntax: ${syntax}`);
    }
  }

  source.push('};');
}
