// services/aiService.js — V3.2 — UNIVERSAL PART DETECTION FOR ALL BRANDS AND PARTS

const OpenAI = require("openai");

class FixedAIService {
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("Clave API OpenAI faltante");

    this.openai = new OpenAI({ apiKey, timeout: 60000, maxRetries: 3 });
    console.log("AI Service v3.2 - Universal part detection for ALL brands");
  }

  async processMessage(messageContent, messageType, mediaUrl, _, contactInfo) {
    try {
      let processedContent = messageContent?.trim() || "";

      // Transcribe or analyze media
      if (["voice", "audio"].includes(messageType)) {
        processedContent = await this.transcribeAudio(mediaUrl);
      } else if (["image", "photo"].includes(messageType)) {
        processedContent = await this.analyzeImage(mediaUrl);
      }

      // Guardar mensaje del usuario
      this._storeMessage(contactInfo.contact_id, 'user', processedContent, { type: messageType });

      // Generar respuesta inteligente
      const result = await this.generateSmartResponse(processedContent, contactInfo);

      // Guardar respuesta del bot
      this._storeMessage(contactInfo.contact_id, 'assistant', result.customer_response, {
        classification: result.classification,
        products_found: result.matched_products?.length || 0
      });

      return result;

    } catch (error) {
      console.error("Error en processMessage:", error.message);
      return this.createFallbackResponse(messageContent || "", contactInfo);
    }
  }

  async generateSmartResponse(userMessage, contactInfo) {
    const isGreeting = this._isSimpleGreeting(userMessage);

    // === ANÁLISIS DE INTENCIÓN (siempre se hace) ===
    const intent = this._understandUserIntent(userMessage);

    let matchedProducts = [];
    let productsText = "Saludo simple detectado - no buscar productos.";

    if (!isGreeting && intent.isSpecific) {
      const PricingService = require('./pricingService');
      const allProducts = await PricingService.searchProducts(userMessage, 100);
      matchedProducts = this._findBestMatches(allProducts, intent);
      productsText = this._formatProductsForPrompt(matchedProducts, intent);
    }

    // Historial real de conversación
    const history = this._getConversationHistory(contactInfo.contact_id, 12);

    // === MENSAJES PARA OPENAI ===
    const messages = [
      { role: "system", content: this._buildSmartSystemPrompt(productsText, intent, isGreeting) }
    ];

    history.forEach(msg => messages.push({ role: msg.role, content: msg.content }));
    messages.push({ role: "user", content: userMessage });

    const completion = await this.openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.3,
      max_tokens: 900,
    });

    const response = completion.choices[0].message.content.trim();

    return {
      customer_response: response,
      classification: this._classifyIntent(intent, isGreeting),
      matched_products: matchedProducts,
      pricing_items_found: matchedProducts.length,
      is_simple_greeting: isGreeting,
      model_used: "gpt-4o"
    };
  }

  _understandUserIntent(message) {
    const lower = message.toLowerCase().replace(/[^\w\s]/g, ' ');

    // Get dynamic brand/part data from pricing service
    const PricingService = require('./pricingService');
    const allBrands = PricingService.allBrands || new Set();
    const allParts = PricingService.allParts || new Set();
    const allModels = PricingService.allModels || new Set();

    // Dynamic model detection using discovered brands and models
    let model = null;
    
    // Try to match any discovered model
    for (const discoveredModel of allModels) {
      if (lower.includes(discoveredModel)) {
        model = discoveredModel;
        break;
      }
    }
    
    // Fallback to pattern matching if no direct model match
    if (!model) {
      // iPhone patterns
      const iphoneMatch = lower.match(/iphone\s*(1[1-9]|[8-9]|xs?\s*max|xr|x|se)/i) ||
                         lower.match(/(14|15|13|12|11|se|xr|xs?\s*max|x)\b.*iphone/i);
      
      // Apple Watch patterns - NEW!
      const watchMatch = lower.match(/(apple\s*)?watch\s*s?(\d+)/i) ||
                        lower.match(/s(\d+)\s*(38|40|42|44)\s*mm/i) ||
                        lower.match(/(google\s*pixel\s*watch|samsung\s*watch|apple\s*watch)/i);
      
      // Huawei patterns  
      const huaweiMatch = lower.match(/huawei\s*([a-z]+\s*\d+[a-z]*|y\d+[a-z]*|p\d+[a-z]*|mate\s*\d+|nova\s*\d+)/i) ||
                         lower.match(/(y\d+[a-z]*|p\d+[a-z]*|mate\s*\d+|nova\s*\d+)\b.*huawei/i);
      
      // Samsung patterns
      const samsungMatch = lower.match(/samsung\s*(galaxy\s*)?([a-z]+\s*\d+[a-z]*|note\s*\d+|s\d+)/i) ||
                          lower.match(/(galaxy\s*)?([a-z]+\s*\d+[a-z]*|note\s*\d+|s\d+)\b.*samsung/i);
      
      if (iphoneMatch) {
        model = `iPhone ${iphoneMatch[0].match(/\d+[a-z]*|se|xr|xs?\s*max|x/i)[0].toUpperCase().replace('XS MAX', 'XS Max')}`;
      } else if (watchMatch) {
        // Extract watch details
        if (watchMatch[2]) {
          model = `Apple Watch S${watchMatch[2]}`;
        } else if (watchMatch[1]) {
          model = `Apple Watch S${watchMatch[1]}`;
        } else {
          model = "Apple Watch"; // Generic fallback to Apple Watch since that's what's in CSV
        }
      } else if (huaweiMatch) {
        const modelPart = huaweiMatch[1] || huaweiMatch[2];
        model = `Huawei ${modelPart.toUpperCase()}`;
      } else if (samsungMatch) {
        const modelPart = samsungMatch[2] || samsungMatch[3];
        model = `Samsung ${modelPart.toUpperCase()}`;
      }
    }

    // UNIVERSAL PART DETECTION SYSTEM FOR ALL PARTS
    let part = null;
    
    // Create universal English-to-Spanish mapping for ALL parts
    const englishToSpanishMap = {
      'screen': 'pantalla', 'display': 'pantalla', 'lcd': 'pantalla', 'glass': 'pantalla',
      'battery': 'bateria', 'power': 'bateria',
      'camera': 'camara', 'lens': 'camara',
      'cover': 'tapa', 'back': 'tapa', 'rear': 'tapa',
      'speaker': 'altavoz', 'audio': 'altavoz',
      'microphone': 'microfono', 'mic': 'microfono',
      'button': 'boton', 'key': 'boton',
      'antenna': 'antena', 'wifi': 'antena', 'bluetooth': 'antena',
      'charging': 'carga', 'charger': 'carga', 'port': 'carga',
      'earpiece': 'auricular', 'receiver': 'auricular',
      'vibrator': 'vibrador', 'motor': 'vibrador',
      'sensor': 'sensor', 'proximity': 'sensor', 'light': 'sensor',
      'sim': 'sim', 'card': 'sim', 'tray': 'sim',
      'flex': 'flex', 'cable': 'flex', 'connector': 'flex',
      'watch': 'watch' // Keep watch as watch for direct matching
    };
    
    // 1. First try exact matches from discovered Spanish parts
    for (const discoveredPart of allParts) {
      if (lower.includes(discoveredPart)) {
        part = discoveredPart;
        break;
      }
    }
    
    // 2. Try English-to-Spanish mapping for ANY English term
    if (!part) {
      for (const [englishTerm, spanishPart] of Object.entries(englishToSpanishMap)) {
        if (lower.includes(englishTerm)) {
          if (allParts.has(spanishPart)) {
            part = spanishPart;
            break;
          }
        }
      }
    }
    
    // 3. Enhanced replacement context detection for ANY part
    if (!part && /replacement|repair|cambio|reparaci[oó]n/i.test(lower)) {
      const beforeMatch = lower.match(/(\w+)\s+replacement/);
      const afterMatch = lower.match(/replacement\s+(\w+)/);
      
      const partWord = beforeMatch?.[1] || afterMatch?.[1];
      if (partWord && englishToSpanishMap[partWord] && allParts.has(englishToSpanishMap[partWord])) {
        part = englishToSpanishMap[partWord];
      }
    }
    
    // 4. Final comprehensive fallback for all possible terms
    if (!part) {
      if (/pantalla|display|lcd|screen|vidrio|cristal|glass|roto|rota/i.test(lower)) part = "pantalla";
      else if (/bater(í|a)|pila|battery|power/i.test(lower)) part = "bateria";
      else if (/c[aá]mara|camera|lente|lens|selfie|face ?id/i.test(lower)) part = "camara";
      else if (/tapa|cover|back|rear|trasera|carcasa/i.test(lower)) part = "tapa";
      else if (/altavoz|speaker|parlante|bocina|audio/i.test(lower)) part = "altavoz";
      else if (/micr[oó]fono|microphone|mic/i.test(lower)) part = "microfono";
      else if (/flex|cable|conector|connector/i.test(lower)) part = "flex";
      else if (/antena|antenna|wifi|bluetooth/i.test(lower)) part = "antena";
      else if (/bot[oó]n|button|key|power|volume/i.test(lower)) part = "boton";
      else if (/auricular|earpiece|receptor|receiver/i.test(lower)) part = "auricular";
      else if (/vibrador|motor|vibration|vibrator/i.test(lower)) part = "vibrador";
      else if (/sensor|proximity|luz|light/i.test(lower)) part = "sensor";
      else if (/sim|card|bandeja|tray/i.test(lower)) part = "sim";
      else if (/carga|charging|charger|puerto|port/i.test(lower)) part = "carga";
    }

    console.log(`🔍 Intent detection: model="${model}", part="${part}" from "${message}"`);

    return {
      raw: message,
      model,
      part,
      isSpecific: !!model || !!part,
      discoveredBrands: [...allBrands],
      discoveredParts: [...allParts]
    };
  }

  _findBestMatches(products, intent) {
    if (!intent.isSpecific || products.length === 0) return [];

    const targetModel = (intent.model || "").toLowerCase();
    const targetPart = intent.part;

    let results = products.filter(p => {
      const name = (p.Producto || "").toLowerCase();

      // Model matching - more flexible for all brands
      let modelOk = true;
      if (targetModel) {
        if (targetModel.includes("iphone")) {
          // iPhone-specific logic
          if (targetModel.includes("14") && targetModel === "iphone 14") {
            modelOk = name.includes("iphone 14") && !/pro|plus|max/.test(name);
          } else {
            modelOk = name.includes(targetModel.replace("iphone ", ""));
          }
        } else if (targetModel.includes("watch")) {
          // Watch-specific logic - match ANY watch products
          modelOk = name.includes("watch");
          
          // If specific watch model requested, try to match that too
          if (targetModel.includes("s3") || targetModel.includes("s 3")) {
            modelOk = modelOk && name.includes("s3");
          } else if (targetModel.includes("s4") || targetModel.includes("s 4")) {
            modelOk = modelOk && name.includes("s4");
          } else if (targetModel.includes("s5") || targetModel.includes("s 5")) {
            modelOk = modelOk && name.includes("s5");
          }
          
          // Match size if specified
          if (targetModel.includes("38") || targetModel.includes("38mm")) {
            modelOk = modelOk && name.includes("38");
          } else if (targetModel.includes("42") || targetModel.includes("42mm")) {
            modelOk = modelOk && name.includes("42");
          }
        } else if (targetModel.includes("huawei")) {
          // Huawei-specific logic
          const huaweiModel = targetModel.replace("huawei ", "");
          modelOk = name.includes("huawei") && name.includes(huaweiModel);
        } else if (targetModel.includes("samsung")) {
          // Samsung-specific logic  
          const samsungModel = targetModel.replace("samsung ", "");
          modelOk = (name.includes("samsung") || name.includes("galaxy")) && name.includes(samsungModel);
        } else {
          // Generic model matching for other brands
          const modelParts = targetModel.split(" ");
          modelOk = modelParts.some(part => name.includes(part)); // Changed from every to some for better matching
        }
      }

      // Part matching - UNIVERSAL for all parts
      let partOk = true;
      if (targetPart) {
        // Use regex to match the part name anywhere in the product name
        const partRegex = new RegExp(targetPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        partOk = partRegex.test(name);
      }

      return modelOk && partOk;
    });

    // If no exact matches and user asked for specific brand watch, suggest Apple Watch alternatives
    if (results.length === 0 && targetModel && targetModel.includes("watch") && !targetModel.includes("apple")) {
      console.log(`🔄 No ${targetModel} found, searching for Apple Watch alternatives...`);
      
      results = products.filter(p => {
        const name = (p.Producto || "").toLowerCase();
        let watchMatch = name.includes("watch");
        
        // Try to match the series if specified
        if (targetModel.includes("s3")) watchMatch = watchMatch && name.includes("s3");
        else if (targetModel.includes("s4")) watchMatch = watchMatch && name.includes("s4");
        else if (targetModel.includes("s5")) watchMatch = watchMatch && name.includes("s5");
        
        // Part matching
        let partOk = true;
        if (targetPart) {
          const partRegex = new RegExp(targetPart.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          partOk = partRegex.test(name);
        }
        
        return watchMatch && partOk;
      });
      
      // Mark as cross-brand suggestions
      results.forEach(result => {
        result._isCrossBrandSuggestion = true;
        result._requestedBrand = targetModel;
      });
    }

    return results.slice(0, 12);
  }

  _formatProductsForPrompt(products, intent) {
    if (products.length === 0) return "No hay stock disponible en este momento.";

    // Check if these are cross-brand suggestions
    const hasCrossBrandSuggestions = products.some(p => p._isCrossBrandSuggestion);
    
    let lines = [];
    
    if (hasCrossBrandSuggestions) {
      const requestedBrand = products.find(p => p._requestedBrand)?._requestedBrand || "requested device";
      lines.push(`No tenemos stock del ${requestedBrand}, pero tenemos estas alternativas compatibles:`);
      lines.push("");
    } else {
      lines.push(`Opciones disponibles${intent.model ? " para " + intent.model : ""}${intent.part ? " - " + intent.part : ""}:`);
      lines.push("");
    }

    products.forEach(p => {
      const name = p.Producto || "Producto";
      const price = this._extractPrice(p);
      lines.push(`• ${name}: ${price > 0 ? price.toLocaleString() + " UYU" : "Consultar precio"}`);
    });

    lines.push("");
    lines.push("Usa exactamente estos nombres y precios.");
    return lines.join("\n");
  }

  _extractPrice(item) {
    const fields = ['PUBLICO TIENDA', 'PUBLICO_TIENDA', 'precio', 'Price', 'PRECIO', 'price'];
    for (const f of fields) {
      if (item[f] != null && item[f] !== "") {
        const num = parseFloat(String(item[f]).replace(/[^\d]/g, ''));
        if (!isNaN(num) && num > 100) return Math.round(num);
      }
    }
    return 0;
  }

  _buildSmartSystemPrompt(productsText, intent, isGreeting) {
    if (isGreeting) {
      return `Eres un asistente amable de ReparaloYA. El cliente solo saludó. Responde cordialmente en español y pregunta en qué puedes ayudar hoy. Ejemplo: "¡Hola! ¿En qué puedo ayudarte hoy?"`;
    }

    return `Eres el asistente experto de ReparaloYA en Montevideo.

REGLAS:
- Responde siempre en español natural
- Solo texto plano
- Usa SOLO los productos y precios de abajo
- Nunca inventes nada
- Si no hay productos → di que no hay stock por ahora

PRODUCTOS EXACTOS:
${productsText}

WhatsApp: 098565349 | Tel: 2200-21-91
Garantía 30 días | Retiro a domicilio

Sé amable y profesional.`;
  }

  _isSimpleGreeting(msg) {
    const lower = (msg || "").toLowerCase().trim();
    const greetings = ['hola', 'hi', 'hello', 'buenos', 'buenas', 'tardes', 'que tal', 'hey', 'saludos'];
    const hasOnlyGreeting = greetings.some(g => lower === g || /^g[!?. ]*$/.test(lower.replace(g, '')));
    const noProduct = !/(iphone|samsung|pantalla|bater|precio|reparar|cámara)/i.test(lower);
    return hasOnlyGreeting && noProduct && lower.length < 30;
  }

  _classifyIntent(intent, isGreeting) {
    let deviceBrand = "unknown";
    if (intent.model?.includes("iPhone")) deviceBrand = "Apple";
    else if (intent.model?.includes("Huawei")) deviceBrand = "Huawei";
    else if (intent.model?.includes("Samsung")) deviceBrand = "Samsung";
    
    return {
      device_brand: deviceBrand,
      device_model: intent.model || "unknown",
      service_type: intent.part || (isGreeting ? "saludo" : "general"),
      is_greeting: isGreeting,
      language: "es",
      confidence: "high"
    };
  }

  _getConversationHistory(id, limit) {
    try {
      const mem = require('./conversationMemoryService');
      return mem.getConversationContext(id, limit).map(m => ({ role: m.role, content: m.content }));
    } catch { return []; }
  }

  _storeMessage(id, role, content, meta = {}) {
    try {
      const mem = require('./conversationMemoryService');
      mem.storeMessage(id, role, content, meta);
    } catch {}
  }

  createFallbackResponse(_, contactInfo) {
    const name = contactInfo.full_name ? ` ${contactInfo.full_name.split(" ")[0]}` : "";
    return {
      customer_response: `¡Hola${name}! ¿En qué puedo ayudarte hoy?`,
      classification: { device_brand: "unknown", service_type: "saludo", is_greeting: true },
      fallback: true
    };
  }

  // Media handlers
  async transcribeAudio() { return "[Audio transcrito]"; }
  async analyzeImage() { return "[Imagen analizada]"; }
}

module.exports = new FixedAIService();