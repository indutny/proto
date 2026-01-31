start
  = $_? @statement|.., _?| $_?

statement =
  syntax /
  package /
  option /
  message /
  enum

syntax =
  "syntax" _ "=" _? value:string _? ";" {
    return { kind: 'syntax', value };
  }

package =
  "package" _ name:property _? ";" {
    return { kind: 'package', name };
  }
option =
  "option" _ name:identifier _? "=" _? value:literal _? ";" {
    return { kind: 'option', name, value };
  }
message =
  "message" _ name:identifier _? "{" _?
    children:(field / reserved / oneof / enum / message / option)|.., _?|
  _? "}" {
    return { kind: 'message', name, children };
  }
field =
  modifier:(@("optional"/"repeated") _)?
  type:property _ name:identifier _? "=" _? id:number _? options:(@inline_options _?)? ";" {
    return { kind: "field", modifier, type, name, id, options };
  }
oneof = "oneof" _ name:identifier _? "{" _?
    children:(field / reserved)|.., _?|
  _? "}" {
    return { kind: 'oneof', children };
  }
enum =
  "enum" _ name:identifier _? "{" _?
    children:(enum_value / reserved / option)|.., _?|
  _? "}" {
    return { kind: 'enum', name, children };
  }
enum_value =
  name:identifier _? "=" _? id:number _? ";" {
    return { kind: "value", name, id };
  }
reserved =
  "reserved" _ id:number _? ";" {
    return { kind: "reserved", id };
  }
inline_options = "[" _?
    @(name: identifier _? "=" _? value:literal {
      return { name, value }
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
