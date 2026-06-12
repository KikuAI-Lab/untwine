export class XmlParseError extends Error {
  constructor(code, message, position) {
    super(message);
    this.name = "XmlParseError";
    this.code = code;
    this.position = position;
  }
}

export function parseXml(input) {
  const baseOffset = input.startsWith("\uFEFF") ? 1 : 0;
  const source = baseOffset === 1 ? input.slice(1) : input;
  const documentNode = {
    type: "document",
    children: []
  };
  const stack = [documentNode];
  let cursor = 0;

  while (cursor < source.length) {
    const tagStart = source.indexOf("<", cursor);
    if (tagStart === -1) {
      appendText(stack[stack.length - 1], source.slice(cursor), cursor + baseOffset);
      break;
    }

    if (tagStart > cursor) {
      appendText(stack[stack.length - 1], source.slice(cursor, tagStart), cursor + baseOffset);
    }

    if (source.startsWith("<!--", tagStart)) {
      const commentEnd = source.indexOf("-->", tagStart + 4);
      if (commentEnd === -1) {
        throw new XmlParseError("malformed_xml", "XML comment is not closed.", tagStart + baseOffset);
      }
      cursor = commentEnd + 3;
      continue;
    }

    if (source.startsWith("<![CDATA[", tagStart)) {
      const cdataEnd = source.indexOf("]]>", tagStart + 9);
      if (cdataEnd === -1) {
        throw new XmlParseError("malformed_xml", "CDATA section is not closed.", tagStart + baseOffset);
      }
      appendText(
        stack[stack.length - 1],
        source.slice(tagStart + 9, cdataEnd),
        tagStart + 9 + baseOffset,
        { decode: false }
      );
      cursor = cdataEnd + 3;
      continue;
    }

    if (source.startsWith("<?", tagStart)) {
      const processingEnd = source.indexOf("?>", tagStart + 2);
      if (processingEnd === -1) {
        throw new XmlParseError("malformed_xml", "XML processing instruction is not closed.", tagStart + baseOffset);
      }
      cursor = processingEnd + 2;
      continue;
    }

    const tagEnd = findTagEnd(source, tagStart);
    const rawTag = source.slice(tagStart + 1, tagEnd);

    if (rawTag.startsWith("/")) {
      const closeName = rawTag.slice(1).trim();
      if (!closeName || /\s/.test(closeName)) {
        throw new XmlParseError("malformed_xml", "Closing tag is malformed.", tagStart + baseOffset);
      }
      const openNode = stack.pop();
      if (!openNode || openNode.type !== "element") {
        throw new XmlParseError("malformed_xml", `Unexpected closing tag </${closeName}>.`, tagStart + baseOffset);
      }
      if (openNode.name !== closeName) {
        throw new XmlParseError(
          "malformed_xml",
          `Closing tag </${closeName}> does not match <${openNode.name}>.`,
          tagStart + baseOffset
        );
      }
      openNode.endOffset = tagEnd + 1 + baseOffset;
      cursor = tagEnd + 1;
      continue;
    }

    if (rawTag.startsWith("!")) {
      cursor = tagEnd + 1;
      continue;
    }

    const parsed = parseStartTag(rawTag, tagStart + 1 + baseOffset, tagEnd + 1 + baseOffset);
    const node = {
      type: "element",
      name: parsed.name,
      localName: localName(parsed.name),
      attrs: parsed.attrs,
      children: [],
      startOffset: tagStart + baseOffset,
      openTagEnd: tagEnd + 1 + baseOffset,
      endOffset: tagEnd + 1 + baseOffset,
      selfClosing: parsed.selfClosing
    };

    stack[stack.length - 1].children.push(node);
    if (!parsed.selfClosing) {
      stack.push(node);
    }
    cursor = tagEnd + 1;
  }

  if (stack.length > 1) {
    const openNode = stack[stack.length - 1];
    throw new XmlParseError("malformed_xml", `Element <${openNode.name}> is not closed.`, openNode.startOffset);
  }

  const roots = documentNode.children.filter((child) => child.type === "element");
  if (roots.length !== 1) {
    throw new XmlParseError("malformed_xml", "XML must have exactly one root element.", 0);
  }

  documentNode.documentElement = roots[0];
  return documentNode;
}

export function attr(node, name) {
  const found = attrMeta(node, name);
  return found ? found.value : null;
}

export function attrMeta(node, name) {
  if (!node || !node.attrs) {
    return null;
  }
  return node.attrs.find((item) => item.name === name || item.localName === name) ?? null;
}

export function childElement(node, local) {
  return elementChildren(node).find((child) => child.localName === local) ?? null;
}

export function elementChildren(node) {
  if (!node || !node.children) {
    return [];
  }
  return node.children.filter((child) => child.type === "element");
}

export function elementsByLocalName(node, local) {
  const found = [];
  visitElements(node, (element) => {
    if (element.localName === local) {
      found.push(element);
    }
  });
  return found;
}

export function inlineSignature(node) {
  const signature = [];
  visitChildElements(node, (element) => {
    const attrs = ["id", "ctype", "rid", "xid", "equiv-text", "clone", "assoc", "pos"]
      .map((name) => {
        const value = attr(element, name);
        return value === null ? null : `${name}=${value}`;
      })
      .filter(Boolean)
      .join(",");
    signature.push(attrs ? `${element.localName}(${attrs})` : element.localName);
  });
  return signature;
}

export function textContent(node) {
  if (!node || !node.children) {
    return "";
  }
  let text = "";
  for (const child of node.children) {
    if (child.type === "text") {
      text += child.value;
    }
    if (child.type === "element") {
      text += textContent(child);
    }
  }
  return text;
}

function appendText(parent, rawText, position, options = {}) {
  if (!rawText) {
    return;
  }
  const value = options.decode === false ? rawText : decodeEntities(rawText, position);
  parent.children.push({
    type: "text",
    value,
    startOffset: position,
    endOffset: position + rawText.length
  });
}

function decodeEntities(raw, position) {
  let output = "";
  let cursor = 0;
  while (cursor < raw.length) {
    const ampersand = raw.indexOf("&", cursor);
    if (ampersand === -1) {
      output += raw.slice(cursor);
      break;
    }
    output += raw.slice(cursor, ampersand);
    const semicolon = raw.indexOf(";", ampersand + 1);
    if (semicolon === -1) {
      throw new XmlParseError("invalid_entities", "XML entity is missing a semicolon.", position + ampersand);
    }
    const entity = raw.slice(ampersand + 1, semicolon);
    output += decodeEntity(entity, position + ampersand);
    cursor = semicolon + 1;
  }
  return output;
}

function decodeEntity(entity, position) {
  if (entity === "amp") {
    return "&";
  }
  if (entity === "lt") {
    return "<";
  }
  if (entity === "gt") {
    return ">";
  }
  if (entity === "quot") {
    return "\"";
  }
  if (entity === "apos") {
    return "'";
  }
  if (/^#x[0-9a-fA-F]+$/.test(entity)) {
    return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
  }
  if (/^#[0-9]+$/.test(entity)) {
    return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
  }
  throw new XmlParseError("invalid_entities", `Unsupported XML entity &${entity};.`, position);
}

function findTagEnd(source, tagStart) {
  let quote = null;
  for (let cursor = tagStart + 1; cursor < source.length; cursor += 1) {
    const char = source[cursor];
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") {
      return cursor;
    }
  }
  throw new XmlParseError("malformed_xml", "XML tag is not closed.", tagStart);
}

function parseStartTag(rawTag, absoluteStart, openTagEnd) {
  let cursor = 0;
  cursor = skipWhitespace(rawTag, cursor);
  const nameStart = cursor;
  while (cursor < rawTag.length && !/[\s/>=]/.test(rawTag[cursor])) {
    cursor += 1;
  }
  const name = rawTag.slice(nameStart, cursor);
  if (!name) {
    throw new XmlParseError("malformed_xml", "Opening tag name is missing.", absoluteStart);
  }

  const attrs = [];
  let selfClosing = false;
  while (cursor < rawTag.length) {
    cursor = skipWhitespace(rawTag, cursor);
    if (cursor >= rawTag.length) {
      break;
    }
    if (rawTag[cursor] === "/") {
      if (rawTag.slice(cursor + 1).trim() !== "") {
        throw new XmlParseError("malformed_xml", "Unexpected text after self-closing slash.", absoluteStart + cursor);
      }
      selfClosing = true;
      break;
    }

    const attrNameStart = cursor;
    while (cursor < rawTag.length && !/[\s=/>]/.test(rawTag[cursor])) {
      cursor += 1;
    }
    const attrName = rawTag.slice(attrNameStart, cursor);
    if (!attrName) {
      throw new XmlParseError("malformed_xml", "Attribute name is missing.", absoluteStart + cursor);
    }

    cursor = skipWhitespace(rawTag, cursor);
    if (rawTag[cursor] !== "=") {
      throw new XmlParseError("malformed_xml", `Attribute ${attrName} is missing '='.`, absoluteStart + cursor);
    }
    cursor += 1;
    cursor = skipWhitespace(rawTag, cursor);

    const quote = rawTag[cursor];
    if (quote !== "\"" && quote !== "'") {
      throw new XmlParseError("malformed_xml", `Attribute ${attrName} must use quotes.`, absoluteStart + cursor);
    }
    cursor += 1;
    const valueStart = cursor;
    while (cursor < rawTag.length && rawTag[cursor] !== quote) {
      cursor += 1;
    }
    if (cursor >= rawTag.length) {
      throw new XmlParseError("malformed_xml", `Attribute ${attrName} is not closed.`, absoluteStart + valueStart);
    }
    const rawValue = rawTag.slice(valueStart, cursor);
    attrs.push({
      name: attrName,
      localName: localName(attrName),
      value: decodeEntities(rawValue, absoluteStart + valueStart),
      valueStart: absoluteStart + valueStart,
      valueEnd: absoluteStart + cursor
    });
    cursor += 1;
  }

  return {
    name,
    attrs,
    selfClosing,
    openTagEnd
  };
}

function skipWhitespace(value, cursor) {
  while (cursor < value.length && /\s/.test(value[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function localName(name) {
  const colon = name.indexOf(":");
  return colon === -1 ? name : name.slice(colon + 1);
}

function visitElements(node, visitor) {
  if (!node || !node.children) {
    return;
  }
  for (const child of node.children) {
    if (child.type === "element") {
      visitor(child);
      visitElements(child, visitor);
    }
  }
}

function visitChildElements(node, visitor) {
  if (!node || !node.children) {
    return;
  }
  for (const child of node.children) {
    if (child.type === "element") {
      visitor(child);
      visitChildElements(child, visitor);
    }
  }
}
