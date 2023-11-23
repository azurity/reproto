const fs = require('fs');
const protobuf = require('protobufjs');

const camelToSnakeCase = str => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

function renderProto(desc, extend, ignoreOption) {
    if (desc instanceof protobuf.Root) {
        return [...Object.entries(desc.options).map(([name, value]) => `option ${name} = ${JSON.stringify(value)};`), ...desc.nestedArray.map((it) => renderProto(it, false)).flat(1)].filter(it => it != '');
    } else if (desc instanceof protobuf.MapField) {
        if (!extend && desc.extend != undefined) return [''];
        if (desc.declaringField?.extend != undefined) return [''];
        const rulePart = desc.rule != undefined ? desc.rule + ' ' : '';
        const optPart = desc.options?.default != undefined ? ` [default=${desc.root.lookup(desc.type) instanceof protobuf.Enum ?
            desc.options.default :
            JSON.stringify(desc.options.default)
            }]` : '';
        return [`${rulePart}map<${desc.keyType}, ${desc.type}> ${camelToSnakeCase(desc.name)} = ${desc.id}${optPart};`];
    } else if (desc instanceof protobuf.Field) {
        if (!extend && desc.extend != undefined) return [''];
        if (desc.declaringField?.extend != undefined) return [''];
        const rulePart = desc.rule != undefined ? desc.rule + ' ' : (desc.optional && !ignoreOption ? 'optional ' : '');
        const optPart = desc.options?.default != undefined ? ` [default=${desc.root.lookup(desc.type) instanceof protobuf.Enum ?
            desc.options.default :
            JSON.stringify(desc.options.default)
            }]` : '';
        return [`${rulePart}${desc.type} ${camelToSnakeCase(desc.name)} = ${desc.id}${optPart};`];
    } else if (desc instanceof protobuf.Enum) {
        return [
            `enum ${desc.name} {`,
            ...Object.entries(desc.values).map(([key, value]) => `\t${key} = ${value};`),
            '}'
        ];
    } else if (desc instanceof protobuf.OneOf) {
        return [
            `oneof ${camelToSnakeCase(desc.name)} {`,
            ...desc.fieldsArray.map((it) => renderProto(it, false, true)).flat(1).filter(it => it != '').map(it => '\t' + it),
            '}'
        ];
    } else if (desc instanceof protobuf.Type) {
        let header = `message ${desc.name} {`;
        if (desc.group) {
            let field = desc.parent.fieldsArray.find(it => it.type == desc.name);
            const rulePart = field.rule != undefined ? field.rule + ' ' : (field.optional ? 'optional ' : '');
            header = `${rulePart}group ${desc.name} = ${field.id} {`;
        }
        let nested = desc.nestedArray.map((it) => renderProto(it, false)).flat(1).filter(it => it != '').map(it => '\t' + it);
        let used = new Set();
        let extendList = new Map();
        for (let it of desc.nestedArray) {
            if (it.group) {
                used.add(desc.fieldsArray.find(item => item.type == it.name).name);
            }
            if (it instanceof protobuf.Field) {
                if (!extendList.has(it.extend)) {
                    extendList.set(it.extend, []);
                }
                extendList.get(it.extend).push(it);
            }
        }
        let extend = [...extendList.entries()].map(([name, items]) => [
            `extend ${name} {`,
            ...items.map((it) => renderProto(it, true)).filter(it => it != '').map(it => '\t' + it),
            '}'
        ]).flat(1);
        let oneof = [];
        if (desc.oneofsArray != undefined) {
            oneof = desc.oneofsArray.map((it) => renderProto(it, false)).flat(1);
            for (let it of desc.oneofsArray) {
                for (let f of it.fieldsArray) {
                    used.add(f.name);
                }
            }
        }
        return [
            header,
            ...nested,
            ...extend.map(it => '\t' + it),
            ...oneof.filter(it => it != '').map(it => '\t' + it),
            ...desc.fieldsArray.filter(it => !used.has(it.name)).map((it) => renderProto(it, false)).filter(it => it != '').map(it => '\t' + it),
            desc.extensions != undefined ? `\textensions ${desc.extensions[0][0]} to ${desc.extensions[0][1] == 536870911 ? 'max' : desc.extensions[0][1]};` : '',
            '}'
        ];
    } else if (desc instanceof protobuf.Namespace) {
        if (desc.fullName == '.google.protobuf') return [];
        const body = desc.nestedArray.map((it) => renderProto(it, false)).flat(1).filter(it => it != '').map(it => '\t' + it);
        if (body.length == 0) return [];
        return [`package ${desc.name} {`, ...body, '}'];
    }
}

if (process.argv.length == 3) {
    const desc = JSON.parse(fs.readFileSync(process.argv[2], { encoding: 'utf-8' }));
    const root = protobuf.Root.fromJSON(desc);
    const rendered = renderProto(root);
    console.log(rendered.join('\n'));
}
