use serde_json::{json, Value};
use std::{
    env,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::{Component, Path},
    process,
};

const APP: &str = "gerchbergsaxton";

fn fail(message: impl std::fmt::Display) -> ! {
    eprintln!("{message}");
    process::exit(1);
}

fn safe_component(value: &str) -> bool {
    !value.is_empty()
        && value != "."
        && value != ".."
        && value.chars().all(|ch| ch.is_ascii_alphanumeric() || "-_".contains(ch))
}

fn read_input() -> Value {
    let mut text = String::new();
    io::stdin().read_to_string(&mut text).unwrap_or_else(|error| fail(error));
    serde_json::from_str(&text).unwrap_or_else(|error| fail(format!("Invalid JSON input: {error}")))
}

fn write_new_json(directory: &Path, name: &str, value: &Value) {
    let path = directory.join(name);
    let mut file = OpenOptions::new().write(true).create_new(true).open(&path)
        .unwrap_or_else(|error| fail(format!("Could not create {}: {error}", path.display())));
    serde_json::to_writer(&mut file, value).unwrap_or_else(|error| fail(error));
    file.write_all(b"\n").unwrap_or_else(|error| fail(error));
    file.sync_all().unwrap_or_else(|error| fail(error));
}

fn save_run(input: Value) {
    let directory = env::current_dir().unwrap_or_else(|error| fail(error));
    let name = directory.file_name().and_then(|value| value.to_str()).unwrap_or_default();
    if !safe_component(name) || !directory.is_dir() {
        fail("The run directory is invalid.");
    }
    let run = input.get("run").cloned().unwrap_or_else(|| fail("Run metadata is missing."));
    let request = input.get("request").cloned().unwrap_or_else(|| fail("The saved input snapshot is missing."));
    let result = input.get("result").cloned().unwrap_or_else(|| fail("The numerical result is missing."));
    if run.get("application").and_then(Value::as_str) != Some(APP)
        || run.get("runId").and_then(Value::as_str) != Some(name)
        || run.get("state").and_then(Value::as_str) != Some("completed")
        || run.get("study").and_then(|study| study.get("id")).and_then(Value::as_str).is_none()
    {
        fail("Run metadata does not match this completed Gerchberg-Saxton run.");
    }
    write_new_json(&directory, "request.json", &request);
    write_new_json(&directory, "result.json", &result);
    // Publish the manifest last; the shared run-history reader ignores incomplete runs.
    write_new_json(&directory, "run.json", &run);
    prune_completed_runs(&directory);
    println!("{}", json!({"runId":name,"state":"completed"}));
}

fn read_manifest(directory: &Path) -> Option<Value> {
    let info = fs::symlink_metadata(directory).ok()?;
    if !info.is_dir() || info.file_type().is_symlink() { return None; }
    let manifest = directory.join("run.json");
    let info = fs::symlink_metadata(&manifest).ok()?;
    if !info.is_file() || info.file_type().is_symlink() { return None; }
    serde_json::from_slice(&fs::read(manifest).ok()?).ok()
}

fn prune_completed_runs(current: &Path) {
    let Some(runs_root) = current.parent() else { return };
    if runs_root.file_name().and_then(|name| name.to_str()) != Some("gerchbergsaxton_runs") { return; }
    let mut owned = fs::read_dir(runs_root).unwrap_or_else(|error| fail(error))
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let path = entry.path();
            let manifest = read_manifest(&path)?;
            if manifest.get("application").and_then(Value::as_str) != Some(APP)
                || manifest.get("state").and_then(Value::as_str) != Some("completed") { return None; }
            let completed = manifest.get("completedAt").and_then(Value::as_str).unwrap_or_default().to_owned();
            Some((path, completed))
        })
        .collect::<Vec<_>>();
    owned.sort_by(|left, right| right.1.cmp(&left.1));
    for (path, _) in owned.into_iter().skip(2) {
        if path == current { continue; }
        fs::remove_dir_all(&path).unwrap_or_else(|error| fail(format!("Could not prune old run {}: {error}", path.display())));
    }
}

fn clear_runs(input: Value) {
    let root = env::current_dir().unwrap_or_else(|error| fail(error));
    let folder = input.get("runsDirectory").and_then(Value::as_str).unwrap_or_default();
    if !safe_component(folder) { fail("The declared run-storage folder is invalid."); }
    let runs = root.join(folder);
    match fs::symlink_metadata(&runs) {
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            println!("{}", json!({"removedRunCount":0})); return;
        }
        Err(error) => fail(error),
        Ok(info) if info.file_type().is_symlink() || !info.is_dir() => fail("Run storage is not a regular directory."),
        Ok(_) => {}
    }
    let mut removed = 0usize;
    for entry in fs::read_dir(&runs).unwrap_or_else(|error| fail(error)) {
        let entry = entry.unwrap_or_else(|error| fail(error));
        let path = entry.path();
        let Some(manifest) = read_manifest(&path) else { continue };
        if manifest.get("application").and_then(Value::as_str) != Some(APP) { continue; }
        fs::remove_dir_all(&path).unwrap_or_else(|error| fail(format!("Could not remove run {}: {error}", path.display())));
        removed += 1;
    }
    println!("{}", json!({"removedRunCount":removed}));
}

fn fft1d(real: &mut [f64], imag: &mut [f64], inverse: bool) {
    let n = real.len();
    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 { j ^= bit; bit >>= 1; }
        j ^= bit;
        if i < j { real.swap(i, j); imag.swap(i, j); }
    }
    let tau = 2.0 * std::f64::consts::PI;
    let mut length = 2usize;
    while length <= n {
        let angle = (if inverse { tau } else { -tau }) / length as f64;
        let (step_real, step_imag) = (angle.cos(), angle.sin());
        let half = length >> 1;
        for start in (0..n).step_by(length) {
            let (mut wr, mut wi) = (1.0, 0.0);
            for offset in 0..half {
                let even = start + offset;
                let odd = even + half;
                let tr = wr * real[odd] - wi * imag[odd];
                let ti = wr * imag[odd] + wi * real[odd];
                let (er, ei) = (real[even], imag[even]);
                real[even] = er + tr; imag[even] = ei + ti;
                real[odd] = er - tr; imag[odd] = ei - ti;
                let next_wr = wr * step_real - wi * step_imag;
                wi = wr * step_imag + wi * step_real; wr = next_wr;
            }
        }
        length <<= 1;
    }
    if inverse { for index in 0..n { real[index] /= n as f64; imag[index] /= n as f64; } }
}

fn fft2(real: &mut [f64], imag: &mut [f64], n: usize, inverse: bool) {
    for y in 0..n { fft1d(&mut real[y*n..(y+1)*n], &mut imag[y*n..(y+1)*n], inverse); }
    let mut column_real = vec![0.0; n];
    let mut column_imag = vec![0.0; n];
    for x in 0..n {
        for y in 0..n { let index = y*n+x; column_real[y] = real[index]; column_imag[y] = imag[index]; }
        fft1d(&mut column_real, &mut column_imag, inverse);
        for y in 0..n { let index = y*n+x; real[index] = column_real[y]; imag[index] = column_imag[y]; }
    }
}

fn shifted_index(x: usize, y: usize, n: usize) -> usize { ((y + n/2) % n)*n + ((x + n/2) % n) }

fn forward_centered(input_real: &[f64], input_imag: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let mut real = input_real.to_vec();
    let mut imag = input_imag.to_vec();
    fft2(&mut real, &mut imag, n, false);
    let mut out_real = vec![0.0; n*n];
    let mut out_imag = vec![0.0; n*n];
    for y in 0..n { for x in 0..n { let from=y*n+x; let to=shifted_index(x,y,n); out_real[to]=real[from]; out_imag[to]=imag[from]; } }
    (out_real, out_imag)
}

fn inverse_centered(input_real: &[f64], input_imag: &[f64], n: usize) -> (Vec<f64>, Vec<f64>) {
    let mut real = vec![0.0; n*n];
    let mut imag = vec![0.0; n*n];
    for y in 0..n { for x in 0..n { let from=y*n+x; let to=shifted_index(x,y,n); real[to]=input_real[from]; imag[to]=input_imag[from]; } }
    fft2(&mut real, &mut imag, n, true);
    (real, imag)
}

fn seeded_random(seed: u32) -> impl FnMut() -> f64 {
    let mut state=seed;
    move || {
        state=state.wrapping_add(0x6D2B79F5);
        let mut value=state;
        value=(value^(value>>15)).wrapping_mul(value|1);
        value^=value.wrapping_add((value^(value>>7)).wrapping_mul(value|61));
        ((value^(value>>14)) as f64)/4294967296.0
    }
}

#[derive(Clone, Debug)]
enum Expr { Number(f64), X, Y, Neg(Box<Expr>), Add(Box<Expr>,Box<Expr>), Sub(Box<Expr>,Box<Expr>), Mul(Box<Expr>,Box<Expr>), Div(Box<Expr>,Box<Expr>), Pow(Box<Expr>,Box<Expr>), Call(String,Vec<Expr>) }

struct ExprParser { tokens: Vec<String>, index: usize }

impl ExprParser {
    fn parse(source: &str) -> Result<Expr,String> {
        let mut tokens=Vec::new(); let chars: Vec<char>=source.chars().collect(); let mut i=0;
        while i<chars.len() {
            let c=chars[i];
            if c.is_whitespace() { i+=1; continue; }
            if c.is_ascii_digit()||c=='.' {
                let start=i; let mut exponent=false; i+=1;
                while i<chars.len() {
                    let ch=chars[i];
                    if ch.is_ascii_digit()||ch=='.' { i+=1; }
                    else if (ch=='e'||ch=='E')&&!exponent { exponent=true; i+=1; if i<chars.len()&&(chars[i]=='+'||chars[i]=='-'){i+=1;} }
                    else { break; }
                }
                tokens.push(chars[start..i].iter().collect()); continue;
            }
            if c.is_ascii_alphabetic()||c=='_' {
                let start=i; i+=1; while i<chars.len()&&(chars[i].is_ascii_alphanumeric()||chars[i]=='_'){i+=1;}
                tokens.push(chars[start..i].iter().collect()); continue;
            }
            if "+-*/^(),".contains(c) { tokens.push(c.to_string()); i+=1; continue; }
            return Err(format!("Unsupported character in illumination expression near {c:?}."));
        }
        tokens.push("<end>".into());
        let mut parser=Self{tokens,index:0};
        let expression=parser.additive()?;
        if parser.peek()!="<end>" { return Err(format!("Invalid illumination expression near {:?}.",parser.peek())); }
        Ok(expression)
    }
    fn peek(&self)->&str { self.tokens.get(self.index).map(String::as_str).unwrap_or("<end>") }
    fn take(&mut self)->String { let value=self.peek().to_owned(); self.index+=1; value }
    fn expect(&mut self,value:&str)->Result<(),String>{if self.take()==value {Ok(())}else{Err(format!("Expected {value:?} in illumination expression."))}}
    fn additive(&mut self)->Result<Expr,String>{
        let mut value=self.multiplicative()?;
        loop { let op=self.peek().to_owned(); if op!="+"&&op!="-" {break;} self.take(); let right=self.multiplicative()?; value=if op=="+"{Expr::Add(Box::new(value),Box::new(right))}else{Expr::Sub(Box::new(value),Box::new(right))}; }
        Ok(value)
    }
    fn multiplicative(&mut self)->Result<Expr,String>{
        let mut value=self.unary()?;
        loop { let op=self.peek().to_owned(); if op!="*"&&op!="/" {break;} self.take(); let right=self.unary()?; value=if op=="*"{Expr::Mul(Box::new(value),Box::new(right))}else{Expr::Div(Box::new(value),Box::new(right))}; }
        Ok(value)
    }
    fn unary(&mut self)->Result<Expr,String>{
        if self.peek()=="+" {self.take();return self.unary();}
        if self.peek()=="-" {self.take();return Ok(Expr::Neg(Box::new(self.unary()?)));}
        let left=self.primary()?;
        if self.peek()=="^" {self.take();return Ok(Expr::Pow(Box::new(left),Box::new(self.unary()?)));}
        Ok(left)
    }
    fn primary(&mut self)->Result<Expr,String>{
        let token=self.take();
        if token=="(" {let value=self.additive()?;self.expect(")")?;return Ok(value);}
        if token=="<end>" {return Err("Illumination expression ended unexpectedly.".into());}
        if let Ok(number)=token.parse::<f64>() {return Ok(Expr::Number(number));}
        let name=token.to_ascii_lowercase();
        if !name.chars().next().is_some_and(|c|c.is_ascii_alphabetic()||c=='_') {return Err(format!("Invalid illumination expression near {token:?}."));}
        if self.peek()=="(" {
            self.take(); let mut args=vec![self.additive()?];
            if self.peek()=="," {self.take();args.push(self.additive()?);}
            self.expect(")")?;
            let arity=match name.as_str(){"abs"|"cos"|"exp"|"log"|"sin"|"sqrt"|"tan"=>1,"max"|"min"|"pow"=>2,_=>return Err(format!("Unsupported illumination function {token:?}."))};
            if args.len()!=arity {return Err(format!("Illumination function {token} requires {arity} argument(s)."));}
            return Ok(Expr::Call(name,args));
        }
        match name.as_str(){"x"=>Ok(Expr::X),"y"=>Ok(Expr::Y),"pi"=>Ok(Expr::Number(std::f64::consts::PI)),"e"=>Ok(Expr::Number(std::f64::consts::E)),_=>Err(format!("Unknown illumination variable or constant {token:?}. Use x, y, pi, or e."))}
    }
}

fn eval_expr(expr:&Expr,x:f64,y:f64)->f64 {
    match expr {
        Expr::Number(value)=>*value, Expr::X=>x, Expr::Y=>y,
        Expr::Neg(a)=>-eval_expr(a,x,y), Expr::Add(a,b)=>eval_expr(a,x,y)+eval_expr(b,x,y),
        Expr::Sub(a,b)=>eval_expr(a,x,y)-eval_expr(b,x,y), Expr::Mul(a,b)=>eval_expr(a,x,y)*eval_expr(b,x,y),
        Expr::Div(a,b)=>eval_expr(a,x,y)/eval_expr(b,x,y), Expr::Pow(a,b)=>eval_expr(a,x,y).powf(eval_expr(b,x,y)),
        Expr::Call(name,args)=>{let a=eval_expr(&args[0],x,y); match name.as_str(){
            "abs"=>a.abs(),"cos"=>a.cos(),"exp"=>a.exp(),"log"=>a.ln(),"sin"=>a.sin(),"sqrt"=>a.sqrt(),"tan"=>a.tan(),
            "max"=>a.max(eval_expr(&args[1],x,y)),"min"=>a.min(eval_expr(&args[1],x,y)),"pow"=>a.powf(eval_expr(&args[1],x,y)),_=>f64::NAN
        }}
    }
}

fn illumination_profile(input:&Value,n:usize,sample_pitch:f64)->Vec<f64>{
    let radius=input.get("apertureRadiusUm").and_then(Value::as_f64).filter(|value|value.is_finite()&&*value>0.0&&*value<=n as f64*sample_pitch/2.0).unwrap_or_else(||fail("Circular aperture radius must be positive and fit within the sampled plane."));
    let source=input.get("amplitudeFunction").and_then(Value::as_str).unwrap_or("1");
    let expression=ExprParser::parse(source).unwrap_or_else(|error|fail(error));
    let mut amplitude=vec![0.0;n*n]; let mut maximum=0.0_f64;
    for yi in 0..n {for xi in 0..n {
        let x=(xi as f64+0.5-n as f64/2.0)*sample_pitch; let y=(yi as f64+0.5-n as f64/2.0)*sample_pitch;
        if x*x+y*y<=radius*radius {
            let value=eval_expr(&expression,x,y);
            if !value.is_finite()||value<0.0 {fail(format!("Illumination amplitude must be finite and nonnegative at x={x:.3}, y={y:.3} µm."));}
            let index=yi*n+xi; amplitude[index]=value; maximum=maximum.max(value);
        }
    }}
    if maximum<=0.0 {fail("Illumination amplitude must be greater than zero somewhere on the aperture.");}
    for value in &mut amplitude {*value/=maximum;}
    amplitude
}

fn numeric_array(input: &Value, key: &str, length: usize) -> Vec<f64> {
    let values=input.get(key).and_then(Value::as_array).unwrap_or_else(|| fail(format!("The Study request is missing {key:?}.")));
    if values.len()!=length { fail(format!("The {key} array must contain exactly {length} samples.")); }
    values.iter().map(|value| value.as_f64().filter(|number| number.is_finite()).unwrap_or_else(|| fail(format!("The {key} array contains an invalid sample.")))).collect()
}

fn calculate_study(input: Value) {
    let n=input.get("size").and_then(Value::as_u64).unwrap_or(0) as usize;
    if !(64..=256).contains(&n) || !n.is_power_of_two() { fail("Choose a square power-of-two grid from 64 through 256."); }
    let count=n*n;
    let iterations=input.get("iterations").and_then(Value::as_u64).filter(|value| (1..=100).contains(value)).unwrap_or_else(|| fail("Choose between 1 and 100 GS iterations.")) as usize;
    let seed=input.get("seed").and_then(Value::as_u64).filter(|value| *value<=u32::MAX as u64).unwrap_or_else(|| fail("The initialization seed must be an unsigned 32-bit integer.")) as u32;
    let wavelength=input.get("wavelengthNm").and_then(Value::as_f64).filter(|value| value.is_finite()&&*value>0.0).unwrap_or_else(|| fail("Wavelength must be finite and greater than zero."));
    let sample_pitch=input.get("samplePitchUm").and_then(Value::as_f64).filter(|value| value.is_finite()&&*value>0.0).unwrap_or_else(|| fail("Sample pitch must be finite and greater than zero."));
    let k0=2.0*std::f64::consts::PI/(wavelength/1000.0);
    let dk=2.0*std::f64::consts::PI/(n as f64*sample_pitch);
    let target=numeric_array(&input,"target",count);
    let illumination=illumination_profile(&input,n,sample_pitch);
    if target.iter().any(|value| *value<0.0) { fail("Target samples must be nonnegative."); }
    let mut propagating=vec![false;count];
    for y in 0..n {for x in 0..n {
        let kx=(x as f64-n as f64/2.0)*dk; let ky=(y as f64-n as f64/2.0)*dk;
        let index=y*n+x; propagating[index]=kx*kx+ky*ky<=k0*k0*(1.0+1e-12);
        if target[index]>0.0&&!propagating[index] {fail("The target contains nonzero samples outside the propagating-wave circle kx² + ky² ≤ k0². Reduce the target width or change wavelength/sample pitch.");}
    }}
    let target_max=target.iter().copied().fold(0.0_f64,f64::max);
    if target_max<=0.0 { fail("The target must contain a positive sample."); }
    let target_amplitude: Vec<f64>=target.iter().map(|value|(value/target_max).sqrt()).collect();
    let mut random=seeded_random(seed);
    let mut real=vec![0.0;count]; let mut imag=vec![0.0;count];
    for i in 0..count { let phase=random()*2.0*std::f64::consts::PI; real[i]=illumination[i]*phase.cos(); imag[i]=illumination[i]*phase.sin(); }
    for _ in 0..iterations {
        let (mut far_real,mut far_imag)=forward_centered(&real,&imag,n);
        for i in 0..count { let phase=far_imag[i].atan2(far_real[i]); let amplitude=if propagating[i]{target_amplitude[i]}else{0.0}; far_real[i]=amplitude*phase.cos(); far_imag[i]=amplitude*phase.sin(); }
        let (near_real,near_imag)=inverse_centered(&far_real,&far_imag,n);
        for i in 0..count { let phase=near_imag[i].atan2(near_real[i]); let amplitude=illumination[i]; real[i]=amplitude*phase.cos(); imag[i]=amplitude*phase.sin(); }
    }
    let (far_real,far_imag)=forward_centered(&real,&imag,n);
    let mut phase:Vec<Option<f64>>=Vec::with_capacity(count); let mut intensity=Vec::with_capacity(count); let mut intensity_max=0.0_f64;
    for i in 0..count {
        let value=if propagating[i]{far_real[i]*far_real[i]+far_imag[i]*far_imag[i]}else{0.0};
        let angle=imag[i].atan2(real[i]).rem_euclid(2.0*std::f64::consts::PI);
        phase.push((illumination[i]>0.0).then_some(angle)); intensity.push(value); intensity_max=intensity_max.max(value);
    }
    if !intensity_max.is_finite()||intensity_max<=0.0 { fail("The GS calculation produced an invalid far-field intensity."); }
    for value in &mut intensity { *value/=intensity_max; }
    println!("{}",json!({"size":n,"target":target,"phase":phase,"intensity":intensity,"wavelengthNm":wavelength,"samplePitchUm":sample_pitch,"k0RadPerUm":k0,"deltaKRadPerUm":dk}));
}

fn main() {
    // Reject an unexpected working-directory path before touching any files.
    let cwd = env::current_dir().unwrap_or_else(|error| fail(error));
    if cwd.components().any(|part| matches!(part, Component::ParentDir)) { fail("The command working directory is invalid."); }
    match env::args().nth(1).as_deref() {
        Some("--run-study") => calculate_study(read_input()),
        Some("--save-run") => save_run(read_input()),
        Some("--clear-results") => clear_runs(read_input()),
        _ => fail("Choose --run-study, --save-run, or --clear-results."),
    }
}
