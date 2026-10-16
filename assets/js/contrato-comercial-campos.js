window.kwComercialCampos = [
  ['Documento',[
    ['fecha','Fecha de firma','date',''],['lugar_firma','Lugar de firma','select','Ciudad de México']
  ]],
  ['Cliente propietario',[
    ['cliente','Nombre completo','text',''],['estado_civil','Estado civil y régimen matrimonial','select',''],
    ['rfc','RFC','text',''],['domicilio_cliente','Domicilio para notificaciones','textarea',''],
    ['correo_cliente','Correo electrónico','email',''],['telefono_cliente','Teléfono móvil','tel','']
  ]],
  ['Inmueble y escritura',[
    ['tipo_inmueble','Tipo de inmueble','select',''],['inmueble','Dirección completa del inmueble','textarea',''],
    ['escritura','Número de instrumento público','text',''],['fecha_escritura','Fecha de escritura','date',''],
    ['notario','Nombre del notario','text',''],['notaria','Número de notaría','text',''],['pais_notaria','País','pais','México'],['ciudad_notaria','Estado','select','Ciudad de México']
  ]],
  ['Profesional',[
    ['asesor','Nombre completo del profesional','text',''],['correo_asesor','Correo del profesional','email',''],
    ['whatsapp_asesor','WhatsApp del profesional','tel',''],['telefono_asesor','Teléfono del profesional','tel','']
  ]],
  ['Precio y comisión',[
    ['precio','Precio de venta','importe',''],['divisa','Divisa','select','MXN'],['comision','Solo Comisión %','number','5'],
    ['pago_promesa','Pago a la promesa de compraventa (%)','number','20'],['pago_escritura','Pago a la escritura (%)','number','80'],
    ['penalidad','Penalidad por desistimiento del comprador (%)','number','5']
  ]],
  ['Vigencia en exclusividad',[
    ['vigencia','Vigencia inicial (días naturales)','number','180'],['renovacion','Renovación automática (días)','number','30'],
    ['proteccion','Protección de prospectos (meses)','number','6']
  ]]
];
