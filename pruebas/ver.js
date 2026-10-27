const pw=require("/opt/npm-tools/node_modules/playwright/index.js");
(async()=>{
  const b=await pw.chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
  for(const [w,tag] of [[1280,"escritorio"],[390,"celular"]]){
    const pg=await (await b.newContext({viewport:{width:w,height:1000}})).newPage();
    const errs=[]; pg.on("pageerror",e=>errs.push(String(e)));
    await pg.goto("file:///tmp/vista.html"); await pg.waitForTimeout(900);
    for(const tb of ["Agenda","Deuda","Por facturar","Ajustes","Declaraciones","Padrón","Anual","Resumen"]){
      await pg.locator('button.tab',{hasText:tb}).first().click();
      await pg.waitForTimeout(400);
      await pg.screenshot({path:`/tmp/${tag}-${tb.replace("ó","o").replace(" ","-")}.png`,fullPage:true});
    }
    const ancho=await pg.evaluate(()=>document.documentElement.scrollWidth);
    console.log(tag,"| errores:",errs.length?errs.slice(0,2):"ninguno",
      "| scroll horizontal:", ancho>w+2 ? "SÍ "+ancho+"px ⚠" : "no");
  }
  await b.close();
})();
