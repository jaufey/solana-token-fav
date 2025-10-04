class Counter {
  constructor(container, options = {}) {
    this.container = container;
    this.value = 0;
    this.options = Object.assign(
      {
        fontSize: 50,
        digitHeight: 60,
        duration: 600,
        easing: "easeOutQuad",
        fadeHeight: 20, // 遮罩渐变高度
        digitGap: -3, 
        // digitGap: 0, 
      },
      options
    );

    this.digits = [];

    // 外层容器
    this.container.classList.add("counter-container");
    Object.assign(this.container.style, {
      position: "relative",
      display: "flex",
      gap: this.options.digitGap + "px", // 使用选项
    });

    // 渐变遮罩
    const topFade = document.createElement("div");
    topFade.classList.add("counter-fade", "counter-fade-top");

    const bottomFade = document.createElement("div");
    bottomFade.classList.add("counter-fade", "counter-fade-bottom");

    Object.assign(topFade.style, {
      position: "absolute",
      top: "0",
      left: "0",
      right: "0",
      height: this.options.fadeHeight + "px",
      background: "linear-gradient(to bottom, var(--counter-bg, white), transparent)",
      pointerEvents: "none",
    });

    Object.assign(bottomFade.style, {
      position: "absolute",
      bottom: "0",
      left: "0",
      right: "0",
      height: this.options.fadeHeight + "px",
      background: "linear-gradient(to top, var(--counter-bg, white), transparent)",
      pointerEvents: "none",
    });

    this.container.appendChild(topFade);
    this.container.appendChild(bottomFade);

    this.update();
  }

  update() {
    if (typeof window === 'undefined' || !this.container.parentElement) {
      return;
    }

    // 递归向上查找第一个设置了背景色的父元素
    let parent = this.container.parentElement;
    let bgColor = 'transparent';
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent);
      bgColor = style.backgroundColor;
      if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
        break;
      }
      parent = parent.parentElement;
    }

    this.container.style.setProperty('--counter-bg', bgColor);
  }

  setValue(newValue) {
    const strValue = String(newValue);
    const oldStrValue = String(this.value);
    const newLen = strValue.length;

    // 初始化 digit DOM
    while (this.digits.length < newLen) {
      const digitWrapper = document.createElement("div");
      digitWrapper.classList.add("counter-digit");
      Object.assign(digitWrapper.style, {
        position: "relative",
        height: this.options.digitHeight + "px",
        overflow: "hidden",
        display: "inline-block",
        verticalAlign: "top",
        // 初始宽度为0，用于入场动画
        width: this.digits.length >= oldStrValue.length ? '0' : 'auto',
      });

      const digitInner = document.createElement("div");
      digitInner.classList.add("counter-digit-inner");
      Object.assign(digitInner.style, {
        // position: "absolute",
        // top: "0",
        // left: "0",
        position: "relative",
        fontSize: this.options.fontSize + "px",
        lineHeight: this.options.digitHeight + "px",
        textAlign: "center",
      });

      // 0-9
      for (let i = 0; i < 10; i++) {
        const span = document.createElement("div");
        span.classList.add("counter-number");
        span.textContent = i;
        digitInner.appendChild(span);
      }

      digitWrapper.appendChild(digitInner);
      this.container.insertBefore(digitWrapper, this.container.lastChild); // 保持在遮罩之前

      this.digits.push({
        wrapper: digitWrapper, // 存储 wrapper 的引用
        inner: digitInner,
      });
    }

    // 动画每一位
    for (let i = 0; i < this.digits.length; i++) {
      const digitObj = this.digits[i];
      const isNewDigit = i >= oldStrValue.length && oldStrValue !== '0';

      if (i < newLen) {
        // 这是需要显示的位数 (包括新增的和已存在的)
        const targetDigit = parseInt(strValue[i]);
        const offset = -targetDigit * this.options.digitHeight;

        // 如果是新增的位数，执行入场动画
        if (isNewDigit) {
            digitObj.wrapper.style.display = 'inline-block';
            anime({
                targets: digitObj.wrapper,
                width: [0, digitObj.wrapper.scrollWidth], // 从0展开到自然宽度
                duration: this.options.duration * 0.8,
                easing: this.options.easing // <-- 使用与主动画一致的曲线
            });
        } else {
            digitObj.wrapper.style.display = 'inline-block';
            // 确保旧位数宽度是自动的，以防万一
            if (digitObj.wrapper.style.width !== 'auto') {
                digitObj.wrapper.style.width = 'auto';
            }
        }

        // 滚动到目标数字
        anime({
          targets: digitObj.inner,
          translateY: offset,
          duration: this.options.duration,
          easing: this.options.easing,
          delay: isNewDigit ? 100 : 0, // 新位数稍微延迟滚动
        });
      } else {
        // 如果新的数字位数更少，执行同步退场动画
        const offsetToZero = 0; // 滚动到0

        // 自动选择与主动画匹配的退场曲线
        const exitEasing = typeof this.options.easing === 'string' ? this.options.easing.replace('easeOut', 'easeIn') : 'easeInCubic';

        const tl = anime.timeline({
          easing: exitEasing,
          duration: this.options.duration * 0.8, // 统一设置默认时长
          complete: () => {
              digitObj.wrapper.style.display = 'none'; // 动画结束后再隐藏
              digitObj.wrapper.style.opacity = 1;
              digitObj.wrapper.style.width = 'auto'; // 重置宽度
          }
        });

        // 将两个动画添加到时间轴的相同起点 (0)
        tl.add({
          targets: digitObj.inner,
          translateY: offsetToZero,
        }, 0).add({
          targets: digitObj.wrapper,
          width: 0,
          opacity: 0,
        }, 0);
      }
    }

    this.value = newValue;
  }
}
