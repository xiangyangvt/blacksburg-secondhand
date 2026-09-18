import { describe, expect, it } from 'vitest';
import { stripTrailingJunk } from './cleanPath';

describe('stripTrailingJunk', () => {
  it('合法路径不动', () => {
    for (const p of ['/', '/roommates', '/item/cmph0xkc300kn', '/s/abc-123', '/roommates/']) {
      expect(stripTrailingJunk(p)).toBeNull();
    }
  });

  it('生产里见到的三种坏路径都回首页', () => {
    expect(stripTrailingJunk('/&')).toBe('/');
    expect(stripTrailingJunk("/'")).toBe('/');
    expect(stripTrailingJunk('/%27')).toBe('/');
  });

  it('削掉板块路径后面粘的中英文标点', () => {
    expect(stripTrailingJunk('/roommates%E3%80%82')).toBe('/roommates');
    expect(stripTrailingJunk('/localnews).')).toBe('/localnews');
    expect(stripTrailingJunk('/item/abc123,')).toBe('/item/abc123');
  });

  it('坏的百分号编码不处理', () => {
    expect(stripTrailingJunk('/%E0%A4%A')).toBeNull();
  });
});
