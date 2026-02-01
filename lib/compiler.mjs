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
    for (let i = 0; i <= path.length; i++) {
      const resolved = path.slice(i).concat(name);
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

class HierarchicalMap {
  constructor(parent, values) {
    this.local = new Map(values);
    this.parent = parent;
  }

  get(name) {
    return this.local.get(name) ?? this.parent?.get(name);
  }

  set(name, value) {
    this.local.set(name, value);
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

export function compile(source) {
  const root = parse(source);

  const out = [];
  const typedefs = [];

  // TODO(indutny): handle
  let pkg;

  const options = new HierarchicalMap();
  const scope = new Scope();

  // First pass: evaluate global configuration, populate scope
  for (const node of root) {
    switch (node.kind) {
      case 'syntax':
        if (node.value !== 'proto3') {
          throw new CompilerError(`Unsupported syntax ${node.value}`, node);
        }
        break;
      case 'package':
        pkg = node.name;
        break;
      case 'option':
        options.set(option.name, option.value);
        break;
      case 'message':
        traverseScope(node, FIELD_MESSAGE, scope, node.name);
        break;
      case 'enum':
        traverseScope(node, FIELD_ENUM, scope, node.name);
        break;
      default:
        throw new CompilerError(`Unexpected root AST node: ${node.kind}`, node);
    }
  }

  // Second pass: translate messages/enums
  for (const node of root) {
    switch (node.kind) {
      case 'message':
        translateMessage(node, options, scope, [node.name], out, typedefs);
        break;
      case 'enum':
        translateEnum(node, options, scope, [node.name], out, typedefs);
        break;
      default:
        // Ignore
        break;
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

function translateMessage(node, parentOptions, scope, path, source, typedefs) {
  const options = new HierarchicalMap(parentOptions);

  const varName = path.join('.');
  if (path.length === 1) {
    source.push(`export const ${path[0]} = {};`);
  } else {
    source.push(`${path.join('.')} = ${varName};`);
  }

  // First pass: options
  for (const child of node.children) {
    switch (child.kind) {
      case 'option':
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
  const fields = new Map();
  const template = ['$unknown: []'];
  for (const child of node.children) {
    switch (child.kind) {
      case 'message':
        translateMessage(
          child,
          options,
          path.concat(child.name),
          source,
          typedefs
        );
        break;
      case 'enum':
        translateEnum(
          child,
          options,
          path.concat(child.name),
          source,
          typedefs
        );
        break;
      case 'field': {
        const resolvedField = scope.resolve(path, child.type);
        const type = scope.get(resolvedField);
        if (type === undefined) {
          throw new CompilerError(
            `Unknown type: ${child.type.join('.')}`,
            child
          );
        }
        for (let i = spec.length; i < child.id - 1; i++) {
          spec.push(FIELD_UNKNOWN);
        }
        spec[child.id - 1] = type;

        // TODO(indutny): options
        if (fields.has(child.name)) {
          throw new CompilerError(`Duplicate field name: ${child.name}`, child);
        }

        const isRepeated = child.modifier === 'repeated';

        fields.set(child.name, {
          id: child.id,
          isRepeated,
          type,
          variableName:
            type === FIELD_ENUM || type === FIELD_MESSAGE
              ? resolvedField.join('.')
              : undefined,
        });

        let defaultValue;
        if (isRepeated) {
          defaultValue = '[]';
        } else {
          switch (type) {
            case FIELD_INT32:
            case FIELD_UINT32:
            case FIELD_SINT32:
            case FIELD_FIXED32:
            case FIELD_SFIXED32:
            case FIELD_FLOAT:
            case FIELD_DOUBLE:
              defaultValue = '0';
              break;
            case FIELD_INT64:
            case FIELD_UINT64:
            case FIELD_SINT64:
            case FIELD_FIXED64:
            case FIELD_SFIXED64:
              defaultValue = '0n';
              break;
            case FIELD_BOOL:
              defaultValue = 'false';
              break;
            case FIELD_ENUM:
              // TODO(indutny)
              defaultValue = 'null';
              break;
            case FIELD_STRING:
              defaultValue = "''";
              break;
            case FIELD_BYTES:
              // Lazy allocated below
              defaultValue = 'null';
              break;
            case FIELD_MESSAGE:
              defaultValue = 'null';
              break;
            default:
              throw new CompilerError(`Unexpected field type: ${type}`, child);
          }
        }
        template.push(`${child.name}:${defaultValue}`);
      }
      case 'oneof':
        // TODO(indutny): implement me
        break;
      case 'reserved':
        // Ignore
        break;
      default:
        break;
    }
  }

  source.push(
    `const ${varName}$SPEC = ${JSON.stringify(spec)};`,
    `${varName}.decode = (data, start, end) => {`,
    `  const fields = $decode(data, ${varName}$SPEC, start, end);`,
    `  const res = {${template.join(',')}};`,
    '  for (const { id, value } of fields) {',
    '    switch (id) {'
  );

  for (const [name, { id, isRepeated, type, variableName }] of fields) {
    source.push(`      case ${id}:`);

    let fieldValue;
    if (variableName !== undefined) {
      fieldValue = `${variableName}.decode(data, value.start, value.end)`;
    } else {
      fieldValue = 'value';
    }

    if (isRepeated) {
      source.push(`        res.${name}.push(${fieldValue});`);
    } else {
      source.push(`        res.${name} = ${fieldValue};`);
    }
    source.push('        break;');
  }

  source.push(
    '      default:',
    '        res.$unknown.push(value);',
    '        break;',
    '    }',
    '  }'
  );

  // Lazy populate default bytes
  for (const [name, { isRepeated, type }] of fields) {
    if (isRepeated) {
      continue;
    }
    if (type === FIELD_BYTES) {
      source.push(
        `  if (res.${name} === null) {`,
        `    res.${name} = new Uint8Array();`,
        '  }'
      );
    }
  }

  source.push('  return res;', '}');
}

function translateEnum(node, parentOptions, path, source, typedefs) {
  const options = new HierarchicalMap(parentOptions);

  // First pass: options
  for (const child of node.children) {
    switch (child.kind) {
      case 'option':
        options.set(child.name, child.value);
        break;
      default:
        break;
    }
  }

  if (path.length === 0) {
    source.push(`export const ${node.name} = {};`);
  } else {
    source.push(`${path.join('.')}.${node.name} = {};`);
  }

  // Second pass: children
  for (const child of node.children) {
    switch (child.kind) {
      case 'value':
      case 'reserved':
        // TODO(indutny):
        break;
      default:
        break;
    }
  }
}
