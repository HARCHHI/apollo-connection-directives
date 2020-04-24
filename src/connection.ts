import { SchemaDirectiveVisitor } from 'apollo-server';
import {
  GraphQLString,
  GraphQLInt,
  GraphQLScalarType,
  GraphQLField,
  GraphQLArgument,
  GraphQLResolveInfo,
} from 'graphql';

type CursorKeyOption = {
  name: String;
  key: Array<string>;
};

type Cursor = {
  after: String;
  before: String;
};

type PaginationOption = {
  first: number;
  after: string;
  last: number;
  before: string;
};

type EdgeInfo = {
  edges: Array<any>;
  firstCursor: string;
  endCursor: string;
};

export function applyCursors(
  datas: Array<any>,
  keyOption: CursorKeyOption,
  targetCursors: Cursor,
):EdgeInfo {
  const { after, before } = targetCursors;
  const { name, key } = keyOption;
  let cursorEnd: boolean = false;
  let firstCursor: string = '';
  let endCursor: string = '';

  const edges: Array<any> = datas.reduce((result: Array<any>, data: any, idx: number) => {
    if (cursorEnd) return result;
    const cursorKey: string = key.reduce((acc: string, val: string) => `${acc}:${data[val]}`, '');
    const cursor: string = Buffer.from(`${name}${cursorKey}`).toString('base64');

    if (idx === 0) firstCursor = cursor;
    if (idx === datas.length - 1) endCursor = cursor;
    if (cursor === after) return [];
    if (cursor === before) {
      cursorEnd = true;
      return result;
    }
    result.push({ node: data, cursor });
    return result;
  }, []);

  return {
    edges,
    firstCursor,
    endCursor,
  };
}

export function paging(datas: Array<any>, keyOption: CursorKeyOption, options: PaginationOption) {
  const {
    first,
    after,
    last,
    before,
  } = options;
  const result: EdgeInfo = applyCursors(datas, keyOption, { after, before });
  const { firstCursor, endCursor } = result;
  let { edges } = result;
  let hasPreviousPage: boolean = false;
  let hasNextPage: boolean = false;


  if (first) edges = edges.slice(0, first);
  edges = edges.slice(last * -1);

  if (edges.length !== 0 && firstCursor !== edges[0].cursor) hasPreviousPage = true;
  if (edges.length !== 0 && endCursor !== edges[edges.length - 1].cursor) hasNextPage = true;

  return {
    edges,
    pageInfo: { hasNextPage, hasPreviousPage },
  };
}

export function createArgument(name: string, type: GraphQLScalarType): GraphQLArgument {
  return {
    name,
    type,
    defaultValue: null,
    description: '',
    extensions: null,
    astNode: null,
  };
}

export function injectArgs(field: GraphQLField<any, any>): GraphQLField<any, any> {
  const result = { ...field };

  result.args = result.args.concat([
    createArgument('after', GraphQLString),
    createArgument('first', GraphQLInt),
    createArgument('before', GraphQLString),
    createArgument('last', GraphQLInt),
  ]);

  return result;
}

export default class Connection extends SchemaDirectiveVisitor {
  visitFieldDefinition(field: GraphQLField<any, any>) {
    const { resolve } = field;
    const { key, name = 'cursor' } = this.args;

    field = injectArgs(field);
    field.resolve = async (parent: any, params: any, context: any, info: GraphQLResolveInfo) => {
      let datas;

      if (parent !== undefined && parent[field.name] !== undefined) datas = parent[field.name];
      if (resolve) datas = await resolve(parent, params, context, info);

      const {
        first = 0, after = null,
        last = 0, before = null,
      } = params;

      return paging(datas, { key, name }, {
        after,
        first,
        last,
        before,
      });
    };
    return field;
  }
}
