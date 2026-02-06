{
  // https://protobuf.dev/programming-guides/proto3/#assigning
  function checkFieldId(id) {
    if (id < 1) {
      error('Field id cannot be zero');
    }
    if (id >= 19000 && id <= 19999) {
      error('Reserved field id');
    }
    if (id > 0x1fffffff) {
      error('Field id out of range');
    }
  }
}

start
  = _? head:(syntax / statement) _? tail:statement|.., _?| _? {
    return [head].concat(tail);
  }

statement =
  package /
  option /
  message /
  enum

syntax =
  "syntax" _ "=" _? value:string _? ";" {
    return { kind: 'syntax', value, loc: location() };
  }

package =
  "package" _ name:property _? ";" {
    return { kind: 'package', name, loc: location() };
  }
option =
  "option" _ name:identifier _? "=" _? value:literal _? ";" {
    return { kind: 'option', name, value, loc: location() };
  }
message =
  "message" _ name:identifier _? "{" _?
    children:(field / reserved / oneof / enum / message / option)|.., _?|
  _? "}" {
    return { kind: 'message', name, children, loc: location() };
  }
field =
  modifier:(@("optional"/"repeated") _)?
  type:property _ name:identifier _? "="
  _? id:number _? options:(@inline_options _?)? ";" {
    checkFieldId(id);
    return {
      kind: 'field',
      modifier,
      type,
      name,
      id,
      options,
      loc: location(),
    };
  }
oneof = "oneof" _ name:identifier _? "{" _?
    children:(field / reserved)|.., _?|
  _? "}" {
    return { kind: 'oneof', name, children, loc: location() };
  }
enum =
  "enum" _ name:identifier _? "{" _?
    children:(enum_value / reserved / option)|.., _?|
  _? "}" {
    return { kind: 'enum', name, children, loc: location() };
  }
enum_value =
  name:identifier _? "=" _? id:number _? ";" {
    return { kind: 'value', name, id, loc: location() };
  }
reserved =
  "reserved" _ id:(number / string) _? ";" {
    checkFieldId(id);
    return { kind: 'reserved', id, loc: location() };
  }
inline_options = "[" _?
    @(name: identifier _? "=" _? value:literal {
      return { name, value, loc: location() }
    })|.., _? "," _?|
  _? "]"

literal = number / boolean / string
number = value:$[0-9]+ { return parseInt(value, 10) }
boolean =
  "true" { return true } /
  "false" { return false}
string = "\"" value:$[^"]* "\"" { return value }
identifier "identifier"
  = $([a-z]i+[a-z0-9_]i*)
property = identifier|.., "."|

_ "whitespace"
  = (ws / comment)+
ws = $[ \t\v\b\r\n]
comment = line_comment / block_comment
line_comment = "//" [^\n]* "\n"
block_comment = "/*" (!"*/" .)* "*/"
