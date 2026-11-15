// hud.js — every DOM readout in the game: vitals, gun box, timer, killfeed,
// banners, the buy menu and the scoreboard. main.js feeds it numbers and
// events; this module owns the elements and nothing else.

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      hud: $('hud'), hp: $('hp'), armor: $('armor'), hpBar: $('hpBar'),
      teamLine: $('teamLine'), gunName: $('gunName'), ammo: $('ammo'),
      money: $('money'), reloadTip: $('reloadTip'), timer: $('timer'),
      phaseLab: $('phaseLab'), objective: $('objective'),
      scoreUs: $('scoreUs'), scoreThem: $('scoreThem'),
      killfeed: $('killfeed'), banner: $('banner'),
      interact: $('interact'), interactBar: $('interactBar'),
      buy: $('buy'), buyItems: $('buyItems'), buyClock: $('buyClock'),
      board: $('board'), boardUs: $('boardUs'), boardThem: $('boardThem'),
      hitmarker: $('hitmarker'), dmgVin: $('dmgVin'), title: $('title'),
    };
    this.bannerTimer = 0;
  }

  showGame() { this.el.hud.classList.remove('hidden'); this.el.title.classList.add('hidden'); }

  vitals(hp, armor, usAlive, themAlive) {
    this.el.hp.textContent = Math.max(0, Math.ceil(hp));
    this.el.hp.style.color = hp <= 30 ? '#ff6b5e' : '#e8e4da';
    this.el.armor.textContent = armor > 0 ? `ARMOR ${Math.ceil(armor)}` : '';
    this.el.hpBar.style.width = `${Math.max(0, hp)}%`;
    this.el.teamLine.textContent = `Jackals alive: ${usAlive} · Wardens alive: ${themAlive}`;
  }

  gun(name, mag, reserve, money, reloading) {
    this.el.gunName.textContent = name;
    this.el.ammo.innerHTML = `${mag} <small>/ ${reserve}</small>`;
    this.el.money.textContent = `$${money}`;
    this.el.reloadTip.textContent = reloading ? 'RELOADING…' : (mag === 0 ? 'PRESS R' : '');
  }

  clock(text, phaseLabel, hot) {
    this.el.timer.textContent = text;
    this.el.phaseLab.textContent = phaseLabel;
    this.el.timer.classList.toggle('hot', !!hot);
  }

  objective(text) { this.el.objective.textContent = text; }
  scores(us, them) { this.el.scoreUs.textContent = us; this.el.scoreThem.textContent = them; }

  hitmark(kill) {
    const h = this.el.hitmarker;
    h.style.opacity = 1;
    h.style.transform = `translate(-50%,-50%) rotate(45deg) scale(${kill ? 1.5 : 1})`;
    clearTimeout(this._hmT);
    this._hmT = setTimeout(() => { h.style.opacity = 0; }, kill ? 220 : 110);
  }

  damageFlash() {
    const v = this.el.dmgVin;
    v.style.opacity = 1;
    clearTimeout(this._dmgT);
    this._dmgT = setTimeout(() => { v.style.opacity = 0; }, 180);
  }

  banner(big, small, cls, holdSec = 2.2) {
    const b = this.el.banner;
    b.querySelector('.big').textContent = big;
    b.querySelector('.small').textContent = small;
    b.className = cls || '';
    b.style.opacity = 1;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { b.style.opacity = 0; }, holdSec * 1000);
  }

  feed(html) {
    const d = document.createElement('div');
    d.className = 'kf';
    d.innerHTML = html;
    this.el.killfeed.appendChild(d);
    while (this.el.killfeed.children.length > 5) this.el.killfeed.firstChild.remove();
    setTimeout(() => { d.style.opacity = 0; d.style.transition = 'opacity .6s'; }, 4200);
    setTimeout(() => d.remove(), 4900);
  }

  interact(label, frac) {
    if (frac === null || frac === undefined) { this.el.interact.classList.add('hidden'); return; }
    this.el.interact.classList.remove('hidden');
    this.el.interact.querySelector('.lbl').textContent = label;
    this.el.interactBar.style.width = `${Math.round(frac * 100)}%`;
  }

  buyMenu(items, money, clockText) {
    this.el.buyClock.textContent = clockText;
    this.el.buyItems.innerHTML = items.map((it) => {
      const cls = it.owned ? 'owned' : (it.price > money ? 'cant' : '');
      const pr = it.owned ? 'OWNED' : `$${it.price}`;
      return `<div class="buyItem ${cls}"><div class="key">${it.key}</div>
        <div><div class="nm">${it.label}</div><div class="ds">${it.desc}</div></div>
        <div class="pr">${pr}</div></div>`;
    }).join('');
  }

  toggleBuy(open) { this.el.buy.classList.toggle('hidden', !open); }

  board(usRows, themRows, open) {
    const fill = (table, rows) => {
      table.innerHTML = '<tr><th>Callsign</th><th>K</th><th>D</th><th>$</th><th>Status</th></tr>' +
        rows.map((r) => `<tr class="${r.me ? 'me' : ''}"><td>${r.name}</td><td>${r.k}</td><td>${r.d}</td><td>$${r.money}</td><td>${r.alive ? 'alive' : 'down'}</td></tr>`).join('');
    };
    fill(this.el.boardUs, usRows);
    fill(this.el.boardThem, themRows);
    this.el.board.classList.toggle('hidden', !open);
  }
}

export function fmtClock(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return `${(sec / 60) | 0}:${String(sec % 60).padStart(2, '0')}`;
}
