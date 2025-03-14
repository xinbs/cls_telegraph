// 常量定义
const TARGET_URL = 'https://www.cls.cn/telegraph';
const UPDATE_INTERVAL = 60; // 1分钟更新一次
const MAX_RETRIES = 3;
const REQUEST_DELAY = 1500;

// 存储上次更新时间
let lastUpdateTime = null;

// 初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('插件已安装/更新');
  setupAlarm();
  fetchTelegraphs();
});

// 设置定时任务
function setupAlarm() {
  // 清除所有现有的定时任务
  chrome.alarms.clearAll(() => {
    // 创建新的定时任务，每分钟执行一次
    chrome.alarms.create('fetchTelegraphs', {
      periodInMinutes: 1
    });
    console.log('已设置1分钟自动刷新');
  });
}

// 监听定时任务
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'fetchTelegraphs') {
    console.log('定时任务触发，开始获取数据...');
    fetchTelegraphs()
      .then(async () => {
        console.log('定时获取数据成功');
        
        // 获取最新数据和设置
        const { telegraphs = [], settings = { badgeType: 'unread', hotThreshold: 10000 } } = 
          await chrome.storage.local.get(['telegraphs', 'settings']);
        
        // 计算各类消息数量
        const counts = {
          total: telegraphs.length,
          unread: telegraphs.filter(t => !t.read).length,
          important: telegraphs.filter(t => t.isImportant).length,
          hot: telegraphs.filter(t => t.readCount >= settings.hotThreshold).length
        };
        
        // 更新最后更新时间
        const timestamp = new Date().toISOString();
        await chrome.storage.local.set({ lastUpdate: timestamp });
        
        // 发送消息通知popup更新
        chrome.runtime.sendMessage({ 
          action: 'updateData',
          timestamp: timestamp,
          counts: counts
        });
        
        // 更新徽章
        let badgeCount = counts[settings.badgeType] || counts.unread;
        chrome.action.setBadgeText({ text: badgeCount.toString() });
        chrome.action.setBadgeBackgroundColor({ 
          color: getBadgeColor(settings.badgeType)
        });
      })
      .catch(error => {
        console.error('定时获取数据失败:', error);
      });
  }
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchTelegraphs') {
    // 直接获取新数据，不清除现有数据
    fetchTelegraphs()
      .then(() => {
        console.log('手动获取电报成功');
        sendResponse({ success: true });
      })
      .catch(error => {
        console.error('手动获取电报失败:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持消息通道开启
  }
});

// 主要抓取函数
async function fetchTelegraphs() {
  console.log('开始获取电报数据...');
  try {
    const response = await fetch(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.cls.cn/'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const html = await response.text();
    const telegraphs = parseTelegraphs(html);
    
    console.log(`解析到 ${telegraphs.length} 条电报`);
    
    // 过滤掉空数据或无效数据
    const validTelegraphs = telegraphs.filter(t => {
      if (!t || !t.id || !t.title || !t.content) {
        console.log('过滤掉无效电报:', t);
        return false;
      }
      return true;
    });
    
    console.log(`有效电报: ${validTelegraphs.length} 条`);
    
    // 检查是否有ID重复的电报（这通常不应该发生）
    const ids = new Set();
    const uniqueTelegraphs = [];
    
    validTelegraphs.forEach(t => {
      if (!ids.has(t.id)) {
        ids.add(t.id);
        uniqueTelegraphs.push(t);
      } else {
        console.log(`发现重复ID的电报: ${t.id}, 标题: ${t.title}`);
      }
    });
    
    if (uniqueTelegraphs.length > 0) {
      await processTelegraphs(uniqueTelegraphs);
    } else {
      console.log('没有获取到有效电报，跳过处理');
    }

    lastUpdateTime = new Date();
    return true;
  } catch (error) {
    console.error('获取电报失败:', error);
    throw error;
  }
}

// 解析电报数据
function parseTelegraphs(html) {
  console.log('开始解析电报数据...');
  const telegraphs = [];

  try {
    // 使用正则表达式匹配电报内容，包括完整的结构
    const regex = /<div[^>]*class="[^"]*telegraph-content-box[^"]*">[\s\S]*?<div[^>]*class="[^"]*subject-bottom-box[^"]*">[\s\S]*?<\/div>\s*<\/div>/gi;
    const matches = html.match(regex) || [];

    console.log(`找到${matches.length}条电报`);
    
    // 输出第一条电报的内容用于调试
    if (matches.length > 0) {
      console.log('第一条电报内容示例:', matches[0].substring(0, 500));
    }

    matches.forEach((match, index) => {
      try {
        const telegraph = parseTelegraphContent(match);
        if (telegraph) {
          telegraphs.push(telegraph);
        }
      } catch (error) {
        console.error(`解析第${index + 1}条电报失败:`, error);
      }
    });

    return telegraphs;
  } catch (error) {
    console.error('解析电报数据失败:', error);
    return [];
  }
}

// 解析单条电报内容
function parseTelegraphContent(html) {
  try {
    // 1. 获取时间（必需）
    const timeMatch = html.match(/<span[^>]*class="[^"]*time[^"]*"[^>]*>(.*?)<\/span>/i);
    if (!timeMatch) {
      console.log('未找到时间，抛弃该条电报');
      return null;
    }
    const originalTimeStr = timeMatch[1].trim();
    
    // 设置正确的时间戳
    const now = new Date();
    const timestamp = new Date();
    
    // 处理时间格式 "HH:mm:ss"
    if (originalTimeStr.includes(':')) {
      const [hours, minutes, seconds] = originalTimeStr.split(':').map(Number);
      timestamp.setHours(hours, minutes, seconds || 0);
      
      // 如果设置后的时间比现在晚，说明是昨天的消息
      if (timestamp > now) {
        timestamp.setDate(timestamp.getDate() - 1);
      }
    }

    // 2. 获取内容区域（必需）
    const contentMatch = html.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (!contentMatch) {
      console.log('未找到内容区域，抛弃该条电报');
      return null;
    }

    // 3. 解析内容
    const contentHtml = contentMatch[1];
    
    // 3.1 检查是否包含重要标记（c-de0422类）
    // 先检查是否是普通内容（c-34304b类）
    const normalContentRegex = /<span[^>]*\bclass="[^"]*\bc-34304b\b[^"]*"[^>]*>/i;
    const isNormalContent = normalContentRegex.test(contentHtml);
    
    // 如果不是普通内容，再检查是否是重要内容（c-de0422类）
    const importantRegex = /<span[^>]*\bclass="[^"]*\bc-de0422\b[^"]*"[^>]*>/i;
    const isImportant = !isNormalContent && importantRegex.test(contentHtml);
    
    // 保存原始HTML
    const processedHtml = isImportant ? contentHtml : null;

    // 3.2 清理HTML标签的函数
    const cleanHtml = (str) => {
      return str
        .replace(/<br\s*\/?>/gi, '\n')  // 保留换行
        .replace(/<[^>]+>/g, '')        // 移除其他HTML标签
        .replace(/\s+/g, ' ')           // 将多个空白字符替换为单个空格
        .trim();
    };

    // 3.3 获取原始文本内容
    const fullText = cleanHtml(contentHtml);
    if (!fullText) {
      console.log('内容为空，抛弃该条电报');
      return null;
    }

    // 3.4 提取标题和内容
          let title = '';
          let content = '';
          
    // 检查是否为百分比格式
    const percentageMatch = fullText.match(/^([+-]\d+\.\d+%)$/);
    if (percentageMatch) {
      console.log('百分比格式，抛弃该条电报');
      return null;
    }

    // 处理【】格式
    if (fullText.startsWith('【') && fullText.includes('】')) {
      const titleEndIndex = fullText.indexOf('】') + 1;
      title = fullText.substring(0, titleEndIndex).trim();
      content = fullText.substring(titleEndIndex).trim();
      
      // 确保内容不为空
          if (!content) {
        content = title;  // 如果没有额外内容，使用标题作为内容
      }
    } 
    // 处理普通文本
    else {
      const lines = fullText.split('\n').filter(line => line.trim());
      
      // 如果有多行，第一行作为标题，其余作为内容
      if (lines.length > 1) {
        title = lines[0].trim();
        content = lines.slice(1).join('\n').trim();
      }
      // 如果只有一行
      else if (lines.length === 1) {
        const text = lines[0].trim();
        // 如果文本较长，取前部分作为标题
        if (text.length > 30) {
          title = text.substring(0, 30).trim() + '...';
          content = text;
        } else {
          title = text;
          content = text;
        }
      }
    }

    // 4. 验证标题和内容
    if (!title || !content) {
      console.log('标题或内容为空，抛弃该条电报');
      return null;
    }

    // 5. 获取阅读量
    let readCount = 0;
    // 使用新的匹配方式，直接匹配 "阅" 后面的数字
    const readCountRegex = /阅(?:<!-- -->)?(\d+(?:\.\d+)?W?|\d+)/i;
    const readCountMatch = html.match(readCountRegex);
    
    if (readCountMatch) {
      const readValue = readCountMatch[1];
      if (readValue.includes('W')) {
        readCount = parseFloat(readValue) * 10000;
        console.log(`阅读量(W格式): ${readValue} (${readCount})`);
      } else {
        readCount = parseInt(readValue);
        console.log(`阅读量(数字格式): ${readCount}`);
      }
    } else {
      console.log('未找到阅读量数据，原始HTML片段:', html.substring(0, 200));
    }

    // 6. 生成唯一ID
    const id = generateId(title + content);

    // 7. 返回解析结果
    const telegraph = {
      id,
      timestamp: timestamp.toISOString(), // 使用ISO格式存储时间戳
      originalTimeStr,
      title,
      content,
      source: '财联社',
      readCount,
      isImportant,
      read: false,
      html: processedHtml // 只在确实是重要内容时才保存HTML
    };

    console.log('成功解析电报:', {
      time: originalTimeStr,
      title: telegraph.title,
      contentPreview: telegraph.content.substring(0, 50) + (telegraph.content.length > 50 ? '...' : ''),
      isImportant: telegraph.isImportant,
      hasHtml: !!telegraph.html
    });

    return telegraph;
  } catch (error) {
    console.error('解析单条电报内容失败:', error);
    return null;
  }
}

// 处理电报数据
async function processTelegraphs(newTelegraphs) {
  console.log(`处理${newTelegraphs.length}条新电报...`);
  
  // 获取现有电报
  const { telegraphs: existingTelegraphs = [] } = await chrome.storage.local.get('telegraphs');
  
  // 获取设置
  const { settings = { notificationsEnabled: true, hotThreshold: 10000, badgeType: 'unread' } } = await chrome.storage.local.get('settings');
  
  // 按时间戳排序（倒序）
  const sortedNewTelegraphs = newTelegraphs.sort((a, b) => {
    // 首先尝试比较原始时间字符串
    if (a.originalTimeStr && b.originalTimeStr) {
      // 如果时间格式是 "今天 HH:mm" 或 "HH:mm:ss"，转换为完整时间进行比较
      const timeA = convertToFullTime(a.originalTimeStr);
      const timeB = convertToFullTime(b.originalTimeStr);
      return timeB - timeA;
    }
    // 如果没有原始时间字符串，使用timestamp
    return b.timestamp - a.timestamp;
  });

  // 合并新旧电报并去重
  const mergedTelegraphs = mergeTelegraphs(existingTelegraphs, sortedNewTelegraphs);
  
  // 保存到存储
  await chrome.storage.local.set({
    telegraphs: mergedTelegraphs,
    lastUpdate: new Date().toISOString()
  });
  
  // 更新微标显示
  const counts = {
    total: mergedTelegraphs.length,
    unread: mergedTelegraphs.filter(t => !t.read).length,
    important: mergedTelegraphs.filter(t => t.isImportant).length,
    hot: mergedTelegraphs.filter(t => t.readCount >= settings.hotThreshold).length
  };
  
  // 根据设置选择显示的数字
  let badgeCount = 0;
  switch (settings.badgeType) {
    case 'total':
      badgeCount = counts.total;
      break;
    case 'unread':
      badgeCount = counts.unread;
      break;
    case 'important':
      badgeCount = counts.important;
      break;
    case 'hot':
      badgeCount = counts.hot;
      break;
  }
  
  // 更新微标
  chrome.action.setBadgeText({ text: badgeCount.toString() });
  chrome.action.setBadgeBackgroundColor({ 
    color: getBadgeColor(settings.badgeType)
  });
  
  // 发送通知
  if (settings.notificationsEnabled) {
    const importantTelegraphs = sortedNewTelegraphs.filter(t => 
      t.isImportant || t.readCount >= settings.hotThreshold
    );
    
    for (const telegraph of importantTelegraphs) {
      sendNotification(telegraph);
    }
  }
  
  // 通知popup更新
  chrome.runtime.sendMessage({ 
    action: 'updateData',
    timestamp: new Date().toISOString(),
    counts: counts
  });
}

// 获取徽章颜色
function getBadgeColor(type) {
  switch (type) {
    case 'important':
      return '#de0422';
    case 'hot':
      return '#ff5722';
    case 'unread':
      return '#1e88e5';
    default:
      return '#666666';
  }
}

// 转换时间字符串为Date对象
function convertToFullTime(timeStr) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // 处理 "今天 HH:mm" 格式
  if (timeStr.startsWith('今天')) {
    const [hours, minutes] = timeStr.split(' ')[1].split(':').map(Number);
    return new Date(today.getTime() + (hours * 60 + minutes) * 60000);
  }
  
  // 处理 "HH:mm:ss" 格式
  if (timeStr.includes(':')) {
    const [hours, minutes, seconds = 0] = timeStr.split(':').map(Number);
    return new Date(today.getTime() + (hours * 3600 + minutes * 60 + seconds) * 1000);
  }
  
  // 如果无法解析，返回当前时间
  return now;
}

// 合并电报并去重
function mergeTelegraphs(existing, newOnes) {
  console.log(`合并电报: 现有${existing.length}条, 新增${newOnes.length}条`);
  
  // 创建一个Map来存储最新的电报（按ID去重）
  const telegraphMap = new Map();
  
  // 创建一个Map来存储已读状态和其他需要保留的属性
  const propertiesMap = new Map();
  
  // 先保存所有已存在电报的状态和属性
  existing.forEach(telegraph => {
    // 保存ID作为索引，以及需要保留的属性
    propertiesMap.set(telegraph.id, {
      read: telegraph.read,
      isImportant: telegraph.isImportant,
      savedTime: telegraph.timestamp
    });
    
    // 将现有电报添加到map中
    telegraphMap.set(telegraph.id, telegraph);
  });
  
  // 检查每条新电报
  newOnes.forEach(newTelegraph => {
    const id = newTelegraph.id;
    const existingTelegraph = telegraphMap.get(id);
    
    // 如果是新电报，直接添加
    if (!existingTelegraph) {
      telegraphMap.set(id, newTelegraph);
      return;
    }
    
    // 如果存在相同ID的电报，保留原有的一些属性
    if (propertiesMap.has(id)) {
      const savedProps = propertiesMap.get(id);
      newTelegraph.read = savedProps.read;
      
      // 特殊处理：如果原电报标记为重要，新电报也应该标记为重要
      if (savedProps.isImportant) {
        newTelegraph.isImportant = true;
      }
      
      // 保留较新的时间戳
      if (savedProps.savedTime) {
        const oldTime = new Date(savedProps.savedTime);
        const newTime = new Date(newTelegraph.timestamp);
        if (oldTime > newTime) {
          newTelegraph.timestamp = savedProps.savedTime;
        }
      }
    }
    
    // 使用新电报更新现有电报（保留了原有的一些属性）
    telegraphMap.set(id, newTelegraph);
    
    console.log(`更新电报: ${id}, 标题: ${newTelegraph.title.substring(0, 20)}...`);
  });
  
  // 转换回数组并按时间排序
  console.log(`合并后总共: ${telegraphMap.size}条电报`);
  return Array.from(telegraphMap.values()).sort((a, b) => {
    // 首先尝试比较原始时间字符串
    if (a.originalTimeStr && b.originalTimeStr) {
      const timeA = convertToFullTime(a.originalTimeStr);
      const timeB = convertToFullTime(b.originalTimeStr);
      return timeB - timeA;
    }
    // 如果没有原始时间字符串，使用timestamp
    return b.timestamp - a.timestamp;
  });
}
    
    // 发送通知
function sendNotification(telegraph) {
  const options = {
        type: 'basic',
    iconUrl: 'icon48.png',
    title: telegraph.isImportant ? '🔴 重要快讯' : '📢 新快讯',
    message: telegraph.title || telegraph.content,
    priority: telegraph.isImportant ? 2 : 1
  };

  chrome.notifications.create(`telegraph_${telegraph.id}`, options);
}

// 生成唯一ID
function generateId(str) {
  // 移除时间戳，只使用标题和内容生成ID
  const cleanStr = str
    .replace(/\s+/g, '') // 移除所有空白字符
    .replace(/<[^>]+>/g, '') // 移除HTML标签
    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') // 只保留中文、英文和数字
    .toLowerCase(); // 转换为小写
    
  // 如果清理后字符串长度超过100，只取前100个字符
  const truncatedStr = cleanStr.length > 100 ? cleanStr.substring(0, 100) : cleanStr;
  
  console.log('用于生成ID的字符串:', truncatedStr);
  
  let hash = 0;
  for (let i = 0; i < truncatedStr.length; i++) {
    const char = truncatedStr.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// 错误处理和重试机制
async function retryWithBackoff(fn, retries = MAX_RETRIES) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
      } catch (error) {
      if (i === retries - 1) throw error;
      const delay = Math.min(1000 * Math.pow(2, i), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
} 