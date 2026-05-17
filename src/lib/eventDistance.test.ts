import { describe, it, expect } from 'vitest';
import { distanceFromBlacksburg, isLocalCore, isWithinNrv } from './eventDistance';

describe('distanceFromBlacksburg', () => {
  it('null / undefined / 空 → 视为远(99)', () => {
    expect(distanceFromBlacksburg(null)).toBe(99);
    expect(distanceFromBlacksburg(undefined)).toBe(99);
    expect(distanceFromBlacksburg('')).toBe(99);
  });

  it('blacksburg → 0', () => {
    expect(distanceFromBlacksburg('Blacksburg')).toBe(0);
    expect(distanceFromBlacksburg('BLACKSBURG')).toBe(0);
  });

  it('逗号后取城市部分', () => {
    expect(distanceFromBlacksburg('Lane Stadium, Blacksburg')).toBe(0);
    expect(distanceFromBlacksburg('Foxridge, Christiansburg')).toBe(8);
  });

  it('州后缀 va / Va. 兼容(无逗号 "{city} VA" 形式)', () => {
    // 实现:对"Radford VA"这种无逗号 form,会去掉 \s+va$ 后查表
    expect(distanceFromBlacksburg('Radford VA')).toBe(13);
    expect(distanceFromBlacksburg('Floyd Va.')).toBe(25);
    // 注:"Radford, VA" 带逗号 form 实际不被支持(lastIndexOf(',') 切走 city)。
    // 生产 location 走 EventPostModal 的 "{venue}, {city}" 拼接,city 不带州后缀。
  });

  it('未知城市 → DEFAULT_FAR_MI (99)', () => {
    expect(distanceFromBlacksburg('Baton Rouge')).toBe(99);
    expect(distanceFromBlacksburg('Some random place')).toBe(99);
  });
});

describe('isLocalCore', () => {
  it('≤ 15 mi 算本地', () => {
    expect(isLocalCore('Blacksburg')).toBe(true);
    expect(isLocalCore('Christiansburg')).toBe(true);
    expect(isLocalCore('Radford')).toBe(true);     // 13mi
    expect(isLocalCore('Newport')).toBe(true);     // 14mi
    expect(isLocalCore('Shawsville')).toBe(true);  // 15mi
  });

  it('> 15 mi 不算本地', () => {
    expect(isLocalCore('Eggleston')).toBe(false);  // 17mi
    expect(isLocalCore('Floyd')).toBe(false);      // 25mi
    expect(isLocalCore('Roanoke')).toBe(false);    // 40mi
  });

  it('null → false', () => {
    expect(isLocalCore(null)).toBe(false);
  });
});

describe('isWithinNrv', () => {
  it('≤ 30 mi 算 NRV 范围', () => {
    expect(isWithinNrv('Blacksburg')).toBe(true);
    expect(isWithinNrv('Floyd')).toBe(true);    // 25mi
    expect(isWithinNrv('Catawba')).toBe(true);  // 28mi
    expect(isWithinNrv('Willis')).toBe(true);   // 30mi
  });

  it('> 30 mi 不算', () => {
    expect(isWithinNrv('Salem')).toBe(false);    // 32mi
    expect(isWithinNrv('Roanoke')).toBe(false);  // 40mi
    expect(isWithinNrv('Lynchburg')).toBe(false);
  });
});
