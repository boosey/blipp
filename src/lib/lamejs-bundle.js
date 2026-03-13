// ../../../../AppData/Local/Temp/lamejs-esm.mjs
function lamejs() {
  function new_byte(count) {
    return new Int8Array(count);
  }
  function new_short(count) {
    return new Int16Array(count);
  }
  function new_int(count) {
    return new Int32Array(count);
  }
  function new_float(count) {
    return new Float32Array(count);
  }
  function new_double(count) {
    return new Float64Array(count);
  }
  function new_float_n(args) {
    if (args.length == 1) {
      return new_float(args[0]);
    }
    var sz = args[0];
    args = args.slice(1);
    var A = [];
    for (var i = 0; i < sz; i++) {
      A.push(new_float_n(args));
    }
    return A;
  }
  function new_int_n(args) {
    if (args.length == 1) {
      return new_int(args[0]);
    }
    var sz = args[0];
    args = args.slice(1);
    var A = [];
    for (var i = 0; i < sz; i++) {
      A.push(new_int_n(args));
    }
    return A;
  }
  function new_short_n(args) {
    if (args.length == 1) {
      return new_short(args[0]);
    }
    var sz = args[0];
    args = args.slice(1);
    var A = [];
    for (var i = 0; i < sz; i++) {
      A.push(new_short_n(args));
    }
    return A;
  }
  function new_array_n(args) {
    if (args.length == 1) {
      return new Array(args[0]);
    }
    var sz = args[0];
    args = args.slice(1);
    var A = [];
    for (var i = 0; i < sz; i++) {
      A.push(new_array_n(args));
    }
    return A;
  }
  var Arrays = {};
  Arrays.fill = function(a, fromIndex, toIndex, val) {
    if (arguments.length == 2) {
      for (var i = 0; i < a.length; i++) {
        a[i] = arguments[1];
      }
    } else {
      for (var i = fromIndex; i < toIndex; i++) {
        a[i] = val;
      }
    }
  };
  var System = {};
  System.arraycopy = function(src, srcPos, dest, destPos, length) {
    var srcEnd = srcPos + length;
    while (srcPos < srcEnd)
      dest[destPos++] = src[srcPos++];
  };
  var Util = {};
  Util.SQRT2 = 1.4142135623730951;
  Util.FAST_LOG10 = function(x) {
    return Math.log10(x);
  };
  Util.FAST_LOG10_X = function(x, y) {
    return Math.log10(x) * y;
  };
  function ShortBlock(ordinal) {
    this.ordinal = ordinal;
  }
  ShortBlock.short_block_allowed = new ShortBlock(0);
  ShortBlock.short_block_coupled = new ShortBlock(1);
  ShortBlock.short_block_dispensed = new ShortBlock(2);
  ShortBlock.short_block_forced = new ShortBlock(3);
  var Float = {};
  Float.MAX_VALUE = 34028235e31;
  function VbrMode(ordinal) {
    this.ordinal = ordinal;
  }
  VbrMode.vbr_off = new VbrMode(0);
  VbrMode.vbr_mt = new VbrMode(1);
  VbrMode.vbr_rh = new VbrMode(2);
  VbrMode.vbr_abr = new VbrMode(3);
  VbrMode.vbr_mtrh = new VbrMode(4);
  VbrMode.vbr_default = VbrMode.vbr_mtrh;
  var assert = function(x) {
  };
  var module_exports = {
    "System": System,
    "VbrMode": VbrMode,
    "Float": Float,
    "ShortBlock": ShortBlock,
    "Util": Util,
    "Arrays": Arrays,
    "new_array_n": new_array_n,
    "new_byte": new_byte,
    "new_double": new_double,
    "new_float": new_float,
    "new_float_n": new_float_n,
    "new_int": new_int,
    "new_int_n": new_int_n,
    "new_short": new_short,
    "new_short_n": new_short_n,
    "assert": assert
  };
  function MPEGMode(ordinal) {
    var _ordinal = ordinal;
    this.ordinal = function() {
      return _ordinal;
    };
  }
  MPEGMode.STEREO = new MPEGMode(0);
  MPEGMode.JOINT_STEREO = new MPEGMode(1);
  MPEGMode.DUAL_CHANNEL = new MPEGMode(2);
  MPEGMode.MONO = new MPEGMode(3);
  MPEGMode.NOT_SET = new MPEGMode(4);
  function Version() {
    var LAME_URL = "http://www.mp3dev.org/";
    var LAME_MAJOR_VERSION = 3;
    var LAME_MINOR_VERSION = 98;
    var LAME_PATCH_VERSION = 4;
    var PSY_MAJOR_VERSION = 0;
    var PSY_MINOR_VERSION = 93;
    this.getLameVersion = function() {
      return LAME_MAJOR_VERSION + "." + LAME_MINOR_VERSION + "." + LAME_PATCH_VERSION;
    };
    this.getLameShortVersion = function() {
      return LAME_MAJOR_VERSION + "." + LAME_MINOR_VERSION + "." + LAME_PATCH_VERSION;
    };
    this.getLameVeryShortVersion = function() {
      return "LAME" + LAME_MAJOR_VERSION + "." + LAME_MINOR_VERSION + "r";
    };
    this.getPsyVersion = function() {
      return PSY_MAJOR_VERSION + "." + PSY_MINOR_VERSION;
    };
    this.getLameUrl = function() {
      return LAME_URL;
    };
    this.getLameOsBitness = function() {
      return "32bits";
    };
  }
  GainAnalysis.STEPS_per_dB = 100;
  GainAnalysis.MAX_dB = 120;
  GainAnalysis.GAIN_NOT_ENOUGH_SAMPLES = -24601;
  GainAnalysis.GAIN_ANALYSIS_ERROR = 0;
  GainAnalysis.GAIN_ANALYSIS_OK = 1;
  GainAnalysis.INIT_GAIN_ANALYSIS_ERROR = 0;
  GainAnalysis.INIT_GAIN_ANALYSIS_OK = 1;
  GainAnalysis.YULE_ORDER = 10;
  GainAnalysis.MAX_ORDER = GainAnalysis.YULE_ORDER;
  GainAnalysis.MAX_SAMP_FREQ = 48e3;
  GainAnalysis.RMS_WINDOW_TIME_NUMERATOR = 1;
  GainAnalysis.RMS_WINDOW_TIME_DENOMINATOR = 20;
  GainAnalysis.MAX_SAMPLES_PER_WINDOW = GainAnalysis.MAX_SAMP_FREQ * GainAnalysis.RMS_WINDOW_TIME_NUMERATOR / GainAnalysis.RMS_WINDOW_TIME_DENOMINATOR + 1;
  function GainAnalysis() {
    var PINK_REF = 64.82;
    var YULE_ORDER = GainAnalysis.YULE_ORDER;
    var RMS_PERCENTILE = 0.95;
    var MAX_SAMP_FREQ = GainAnalysis.MAX_SAMP_FREQ;
    var RMS_WINDOW_TIME_NUMERATOR = GainAnalysis.RMS_WINDOW_TIME_NUMERATOR;
    var RMS_WINDOW_TIME_DENOMINATOR = GainAnalysis.RMS_WINDOW_TIME_DENOMINATOR;
    var MAX_SAMPLES_PER_WINDOW = GainAnalysis.MAX_SAMPLES_PER_WINDOW;
    var ABYule = [
      [
        0.038575994352,
        -3.84664617118067,
        -0.02160367184185,
        7.81501653005538,
        -0.00123395316851,
        -11.34170355132042,
        -9291677959e-14,
        13.05504219327545,
        -0.01655260341619,
        -12.28759895145294,
        0.02161526843274,
        9.4829380631979,
        -0.02074045215285,
        -5.87257861775999,
        0.00594298065125,
        2.75465861874613,
        0.00306428023191,
        -0.86984376593551,
        12025322027e-14,
        0.13919314567432,
        0.00288463683916
      ],
      [
        0.0541865640643,
        -3.47845948550071,
        -0.02911007808948,
        6.36317777566148,
        -0.00848709379851,
        -8.54751527471874,
        -0.00851165645469,
        9.4769360780128,
        -0.00834990904936,
        -8.81498681370155,
        0.02245293253339,
        6.85401540936998,
        -0.02596338512915,
        -4.39470996079559,
        0.01624864962975,
        2.19611684890774,
        -0.00240879051584,
        -0.75104302451432,
        0.00674613682247,
        0.13149317958808,
        -0.00187763777362
      ],
      [
        0.15457299681924,
        -2.37898834973084,
        -0.09331049056315,
        2.84868151156327,
        -0.06247880153653,
        -2.64577170229825,
        0.02163541888798,
        2.23697657451713,
        -0.05588393329856,
        -1.67148153367602,
        0.04781476674921,
        1.00595954808547,
        0.00222312597743,
        -0.45953458054983,
        0.03174092540049,
        0.16378164858596,
        -0.01390589421898,
        -0.05032077717131,
        0.00651420667831,
        0.0234789740702,
        -0.00881362733839
      ],
      [
        0.30296907319327,
        -1.61273165137247,
        -0.22613988682123,
        1.0797749225997,
        -0.08587323730772,
        -0.2565625775407,
        0.03282930172664,
        -0.1627671912044,
        -0.00915702933434,
        -0.22638893773906,
        -0.02364141202522,
        0.39120800788284,
        -0.00584456039913,
        -0.22138138954925,
        0.06276101321749,
        0.04500235387352,
        -828086748e-14,
        0.02005851806501,
        0.00205861885564,
        0.00302439095741,
        -0.02950134983287
      ],
      [
        0.33642304856132,
        -1.49858979367799,
        -0.2557224142557,
        0.87350271418188,
        -0.11828570177555,
        0.12205022308084,
        0.11921148675203,
        -0.80774944671438,
        -0.07834489609479,
        0.47854794562326,
        -0.0046997791438,
        -0.12453458140019,
        -0.0058950022444,
        -0.04067510197014,
        0.05724228140351,
        0.08333755284107,
        0.00832043980773,
        -0.04237348025746,
        -0.0163538138454,
        0.02977207319925,
        -0.0176017656815
      ],
      [
        0.4491525660845,
        -0.62820619233671,
        -0.14351757464547,
        0.29661783706366,
        -0.22784394429749,
        -0.372563729424,
        -0.01419140100551,
        0.00213767857124,
        0.04078262797139,
        -0.42029820170918,
        -0.12398163381748,
        0.22199650564824,
        0.04097565135648,
        0.00613424350682,
        0.10478503600251,
        0.06747620744683,
        -0.01863887810927,
        0.05784820375801,
        -0.03193428438915,
        0.03222754072173,
        0.00541907748707
      ],
      [
        0.56619470757641,
        -1.04800335126349,
        -0.75464456939302,
        0.29156311971249,
        0.1624213774223,
        -0.26806001042947,
        0.16744243493672,
        0.00819999645858,
        -0.18901604199609,
        0.45054734505008,
        0.3093178284183,
        -0.33032403314006,
        -0.27562961986224,
        0.0673936833311,
        0.00647310677246,
        -0.04784254229033,
        0.08647503780351,
        0.01639907836189,
        -0.0378898455484,
        0.01807364323573,
        -0.00588215443421
      ],
      [
        0.58100494960553,
        -0.51035327095184,
        -0.53174909058578,
        -0.31863563325245,
        -0.14289799034253,
        -0.20256413484477,
        0.17520704835522,
        0.1472815413433,
        0.02377945217615,
        0.38952639978999,
        0.15558449135573,
        -0.23313271880868,
        -0.25344790059353,
        -0.05246019024463,
        0.01628462406333,
        -0.02505961724053,
        0.06920467763959,
        0.02442357316099,
        -0.03721611395801,
        0.01818801111503,
        -0.00749618797172
      ],
      [
        0.53648789255105,
        -0.2504987195602,
        -0.42163034350696,
        -0.43193942311114,
        -0.00275953611929,
        -0.03424681017675,
        0.04267842219415,
        -0.04678328784242,
        -0.10214864179676,
        0.26408300200955,
        0.14590772289388,
        0.15113130533216,
        -0.02459864859345,
        -0.17556493366449,
        -0.11202315195388,
        -0.18823009262115,
        -0.04060034127,
        0.05477720428674,
        0.0478866554818,
        0.0470440968812,
        -0.02217936801134
      ]
    ];
    var ABButter = [
      [
        0.98621192462708,
        -1.97223372919527,
        -1.97242384925416,
        0.97261396931306,
        0.98621192462708
      ],
      [
        0.98500175787242,
        -1.96977855582618,
        -1.97000351574484,
        0.9702284756635,
        0.98500175787242
      ],
      [
        0.97938932735214,
        -1.95835380975398,
        -1.95877865470428,
        0.95920349965459,
        0.97938932735214
      ],
      [
        0.97531843204928,
        -1.95002759149878,
        -1.95063686409857,
        0.95124613669835,
        0.97531843204928
      ],
      [
        0.97316523498161,
        -1.94561023566527,
        -1.94633046996323,
        0.94705070426118,
        0.97316523498161
      ],
      [
        0.96454515552826,
        -1.92783286977036,
        -1.92909031105652,
        0.93034775234268,
        0.96454515552826
      ],
      [
        0.96009142950541,
        -1.91858953033784,
        -1.92018285901082,
        0.92177618768381,
        0.96009142950541
      ],
      [
        0.95856916599601,
        -1.9154210807478,
        -1.91713833199203,
        0.91885558323625,
        0.95856916599601
      ],
      [
        0.94597685600279,
        -1.88903307939452,
        -1.89195371200558,
        0.89487434461664,
        0.94597685600279
      ]
    ];
    function filterYule(input, inputPos, output, outputPos, nSamples, kernel) {
      while (nSamples-- != 0) {
        output[outputPos] = 1e-10 + input[inputPos + 0] * kernel[0] - output[outputPos - 1] * kernel[1] + input[inputPos - 1] * kernel[2] - output[outputPos - 2] * kernel[3] + input[inputPos - 2] * kernel[4] - output[outputPos - 3] * kernel[5] + input[inputPos - 3] * kernel[6] - output[outputPos - 4] * kernel[7] + input[inputPos - 4] * kernel[8] - output[outputPos - 5] * kernel[9] + input[inputPos - 5] * kernel[10] - output[outputPos - 6] * kernel[11] + input[inputPos - 6] * kernel[12] - output[outputPos - 7] * kernel[13] + input[inputPos - 7] * kernel[14] - output[outputPos - 8] * kernel[15] + input[inputPos - 8] * kernel[16] - output[outputPos - 9] * kernel[17] + input[inputPos - 9] * kernel[18] - output[outputPos - 10] * kernel[19] + input[inputPos - 10] * kernel[20];
        ++outputPos;
        ++inputPos;
      }
    }
    function filterButter(input, inputPos, output, outputPos, nSamples, kernel) {
      while (nSamples-- != 0) {
        output[outputPos] = input[inputPos + 0] * kernel[0] - output[outputPos - 1] * kernel[1] + input[inputPos - 1] * kernel[2] - output[outputPos - 2] * kernel[3] + input[inputPos - 2] * kernel[4];
        ++outputPos;
        ++inputPos;
      }
    }
    function ResetSampleFrequency(rgData, samplefreq) {
      for (var i = 0; i < MAX_ORDER; i++)
        rgData.linprebuf[i] = rgData.lstepbuf[i] = rgData.loutbuf[i] = rgData.rinprebuf[i] = rgData.rstepbuf[i] = rgData.routbuf[i] = 0;
      switch (0 | samplefreq) {
        case 48e3:
          rgData.reqindex = 0;
          break;
        case 44100:
          rgData.reqindex = 1;
          break;
        case 32e3:
          rgData.reqindex = 2;
          break;
        case 24e3:
          rgData.reqindex = 3;
          break;
        case 22050:
          rgData.reqindex = 4;
          break;
        case 16e3:
          rgData.reqindex = 5;
          break;
        case 12e3:
          rgData.reqindex = 6;
          break;
        case 11025:
          rgData.reqindex = 7;
          break;
        case 8e3:
          rgData.reqindex = 8;
          break;
        default:
          return INIT_GAIN_ANALYSIS_ERROR;
      }
      rgData.sampleWindow = 0 | (samplefreq * RMS_WINDOW_TIME_NUMERATOR + RMS_WINDOW_TIME_DENOMINATOR - 1) / RMS_WINDOW_TIME_DENOMINATOR;
      rgData.lsum = 0;
      rgData.rsum = 0;
      rgData.totsamp = 0;
      Arrays.ill(rgData.A, 0);
      return INIT_GAIN_ANALYSIS_OK;
    }
    this.InitGainAnalysis = function(rgData, samplefreq) {
      if (ResetSampleFrequency(rgData, samplefreq) != INIT_GAIN_ANALYSIS_OK) {
        return INIT_GAIN_ANALYSIS_ERROR;
      }
      rgData.linpre = MAX_ORDER;
      rgData.rinpre = MAX_ORDER;
      rgData.lstep = MAX_ORDER;
      rgData.rstep = MAX_ORDER;
      rgData.lout = MAX_ORDER;
      rgData.rout = MAX_ORDER;
      Arrays.fill(rgData.B, 0);
      return INIT_GAIN_ANALYSIS_OK;
    };
    function fsqr(d) {
      return d * d;
    }
    this.AnalyzeSamples = function(rgData, left_samples, left_samplesPos, right_samples, right_samplesPos, num_samples, num_channels) {
      var curleft;
      var curleftBase;
      var curright;
      var currightBase;
      var batchsamples;
      var cursamples;
      var cursamplepos;
      if (num_samples == 0)
        return GAIN_ANALYSIS_OK;
      cursamplepos = 0;
      batchsamples = num_samples;
      switch (num_channels) {
        case 1:
          right_samples = left_samples;
          right_samplesPos = left_samplesPos;
          break;
        case 2:
          break;
        default:
          return GAIN_ANALYSIS_ERROR;
      }
      if (num_samples < MAX_ORDER) {
        System.arraycopy(
          left_samples,
          left_samplesPos,
          rgData.linprebuf,
          MAX_ORDER,
          num_samples
        );
        System.arraycopy(
          right_samples,
          right_samplesPos,
          rgData.rinprebuf,
          MAX_ORDER,
          num_samples
        );
      } else {
        System.arraycopy(
          left_samples,
          left_samplesPos,
          rgData.linprebuf,
          MAX_ORDER,
          MAX_ORDER
        );
        System.arraycopy(
          right_samples,
          right_samplesPos,
          rgData.rinprebuf,
          MAX_ORDER,
          MAX_ORDER
        );
      }
      while (batchsamples > 0) {
        cursamples = batchsamples > rgData.sampleWindow - rgData.totsamp ? rgData.sampleWindow - rgData.totsamp : batchsamples;
        if (cursamplepos < MAX_ORDER) {
          curleft = rgData.linpre + cursamplepos;
          curleftBase = rgData.linprebuf;
          curright = rgData.rinpre + cursamplepos;
          currightBase = rgData.rinprebuf;
          if (cursamples > MAX_ORDER - cursamplepos)
            cursamples = MAX_ORDER - cursamplepos;
        } else {
          curleft = left_samplesPos + cursamplepos;
          curleftBase = left_samples;
          curright = right_samplesPos + cursamplepos;
          currightBase = right_samples;
        }
        filterYule(curleftBase, curleft, rgData.lstepbuf, rgData.lstep + rgData.totsamp, cursamples, ABYule[rgData.reqindex]);
        filterYule(currightBase, curright, rgData.rstepbuf, rgData.rstep + rgData.totsamp, cursamples, ABYule[rgData.reqindex]);
        filterButter(
          rgData.lstepbuf,
          rgData.lstep + rgData.totsamp,
          rgData.loutbuf,
          rgData.lout + rgData.totsamp,
          cursamples,
          ABButter[rgData.reqindex]
        );
        filterButter(
          rgData.rstepbuf,
          rgData.rstep + rgData.totsamp,
          rgData.routbuf,
          rgData.rout + rgData.totsamp,
          cursamples,
          ABButter[rgData.reqindex]
        );
        curleft = rgData.lout + rgData.totsamp;
        curleftBase = rgData.loutbuf;
        curright = rgData.rout + rgData.totsamp;
        currightBase = rgData.routbuf;
        var i = cursamples % 8;
        while (i-- != 0) {
          rgData.lsum += fsqr(curleftBase[curleft++]);
          rgData.rsum += fsqr(currightBase[curright++]);
        }
        i = cursamples / 8;
        while (i-- != 0) {
          rgData.lsum += fsqr(curleftBase[curleft + 0]) + fsqr(curleftBase[curleft + 1]) + fsqr(curleftBase[curleft + 2]) + fsqr(curleftBase[curleft + 3]) + fsqr(curleftBase[curleft + 4]) + fsqr(curleftBase[curleft + 5]) + fsqr(curleftBase[curleft + 6]) + fsqr(curleftBase[curleft + 7]);
          curleft += 8;
          rgData.rsum += fsqr(currightBase[curright + 0]) + fsqr(currightBase[curright + 1]) + fsqr(currightBase[curright + 2]) + fsqr(currightBase[curright + 3]) + fsqr(currightBase[curright + 4]) + fsqr(currightBase[curright + 5]) + fsqr(currightBase[curright + 6]) + fsqr(currightBase[curright + 7]);
          curright += 8;
        }
        batchsamples -= cursamples;
        cursamplepos += cursamples;
        rgData.totsamp += cursamples;
        if (rgData.totsamp == rgData.sampleWindow) {
          var val = GainAnalysis.STEPS_per_dB * 10 * Math.log10((rgData.lsum + rgData.rsum) / rgData.totsamp * 0.5 + 1e-37);
          var ival = val <= 0 ? 0 : 0 | val;
          if (ival >= rgData.A.length)
            ival = rgData.A.length - 1;
          rgData.A[ival]++;
          rgData.lsum = rgData.rsum = 0;
          System.arraycopy(
            rgData.loutbuf,
            rgData.totsamp,
            rgData.loutbuf,
            0,
            MAX_ORDER
          );
          System.arraycopy(
            rgData.routbuf,
            rgData.totsamp,
            rgData.routbuf,
            0,
            MAX_ORDER
          );
          System.arraycopy(
            rgData.lstepbuf,
            rgData.totsamp,
            rgData.lstepbuf,
            0,
            MAX_ORDER
          );
          System.arraycopy(
            rgData.rstepbuf,
            rgData.totsamp,
            rgData.rstepbuf,
            0,
            MAX_ORDER
          );
          rgData.totsamp = 0;
        }
        if (rgData.totsamp > rgData.sampleWindow) {
          return GAIN_ANALYSIS_ERROR;
        }
      }
      if (num_samples < MAX_ORDER) {
        System.arraycopy(
          rgData.linprebuf,
          num_samples,
          rgData.linprebuf,
          0,
          MAX_ORDER - num_samples
        );
        System.arraycopy(
          rgData.rinprebuf,
          num_samples,
          rgData.rinprebuf,
          0,
          MAX_ORDER - num_samples
        );
        System.arraycopy(
          left_samples,
          left_samplesPos,
          rgData.linprebuf,
          MAX_ORDER - num_samples,
          num_samples
        );
        System.arraycopy(
          right_samples,
          right_samplesPos,
          rgData.rinprebuf,
          MAX_ORDER - num_samples,
          num_samples
        );
      } else {
        System.arraycopy(left_samples, left_samplesPos + num_samples - MAX_ORDER, rgData.linprebuf, 0, MAX_ORDER);
        System.arraycopy(right_samples, right_samplesPos + num_samples - MAX_ORDER, rgData.rinprebuf, 0, MAX_ORDER);
      }
      return GAIN_ANALYSIS_OK;
    };
    function analyzeResult(Array2, len) {
      var i;
      var elems = 0;
      for (i = 0; i < len; i++)
        elems += Array2[i];
      if (elems == 0)
        return GAIN_NOT_ENOUGH_SAMPLES;
      var upper = 0 | Math.ceil(elems * (1 - RMS_PERCENTILE));
      for (i = len; i-- > 0; ) {
        if ((upper -= Array2[i]) <= 0)
          break;
      }
      return PINK_REF - i / GainAnalysis.STEPS_per_dB;
    }
    this.GetTitleGain = function(rgData) {
      var retval = analyzeResult(rgData.A, rgData.A.length);
      for (var i = 0; i < rgData.A.length; i++) {
        rgData.B[i] += rgData.A[i];
        rgData.A[i] = 0;
      }
      for (var i = 0; i < MAX_ORDER; i++)
        rgData.linprebuf[i] = rgData.lstepbuf[i] = rgData.loutbuf[i] = rgData.rinprebuf[i] = rgData.rstepbuf[i] = rgData.routbuf[i] = 0;
      rgData.totsamp = 0;
      rgData.lsum = rgData.rsum = 0;
      return retval;
    };
  }
  function Presets() {
    function VBRPresets(qual, comp, compS, y, shThreshold, shThresholdS, adj, adjShort, lower, curve, sens, inter, joint, mod, fix) {
      this.vbr_q = qual;
      this.quant_comp = comp;
      this.quant_comp_s = compS;
      this.expY = y;
      this.st_lrm = shThreshold;
      this.st_s = shThresholdS;
      this.masking_adj = adj;
      this.masking_adj_short = adjShort;
      this.ath_lower = lower;
      this.ath_curve = curve;
      this.ath_sensitivity = sens;
      this.interch = inter;
      this.safejoint = joint;
      this.sfb21mod = mod;
      this.msfix = fix;
    }
    function ABRPresets(kbps, comp, compS, joint, fix, shThreshold, shThresholdS, bass, sc, mask, lower, curve, interCh, sfScale) {
      this.quant_comp = comp;
      this.quant_comp_s = compS;
      this.safejoint = joint;
      this.nsmsfix = fix;
      this.st_lrm = shThreshold;
      this.st_s = shThresholdS;
      this.nsbass = bass;
      this.scale = sc;
      this.masking_adj = mask;
      this.ath_lower = lower;
      this.ath_curve = curve;
      this.interch = interCh;
      this.sfscale = sfScale;
    }
    var lame;
    this.setModules = function(_lame) {
      lame = _lame;
    };
    var vbr_old_switch_map = [
      new VBRPresets(0, 9, 9, 0, 5.2, 125, -4.2, -6.3, 4.8, 1, 0, 0, 2, 21, 0.97),
      new VBRPresets(1, 9, 9, 0, 5.3, 125, -3.6, -5.6, 4.5, 1.5, 0, 0, 2, 21, 1.35),
      new VBRPresets(2, 9, 9, 0, 5.6, 125, -2.2, -3.5, 2.8, 2, 0, 0, 2, 21, 1.49),
      new VBRPresets(3, 9, 9, 1, 5.8, 130, -1.8, -2.8, 2.6, 3, -4, 0, 2, 20, 1.64),
      new VBRPresets(4, 9, 9, 1, 6, 135, -0.7, -1.1, 1.1, 3.5, -8, 0, 2, 0, 1.79),
      new VBRPresets(5, 9, 9, 1, 6.4, 140, 0.5, 0.4, -7.5, 4, -12, 2e-4, 0, 0, 1.95),
      new VBRPresets(6, 9, 9, 1, 6.6, 145, 0.67, 0.65, -14.7, 6.5, -19, 4e-4, 0, 0, 2.3),
      new VBRPresets(7, 9, 9, 1, 6.6, 145, 0.8, 0.75, -19.7, 8, -22, 6e-4, 0, 0, 2.7),
      new VBRPresets(8, 9, 9, 1, 6.6, 145, 1.2, 1.15, -27.5, 10, -23, 7e-4, 0, 0, 0),
      new VBRPresets(9, 9, 9, 1, 6.6, 145, 1.6, 1.6, -36, 11, -25, 8e-4, 0, 0, 0),
      new VBRPresets(10, 9, 9, 1, 6.6, 145, 2, 2, -36, 12, -25, 8e-4, 0, 0, 0)
    ];
    var vbr_psy_switch_map = [
      new VBRPresets(0, 9, 9, 0, 4.2, 25, -7, -4, 7.5, 1, 0, 0, 2, 26, 0.97),
      new VBRPresets(1, 9, 9, 0, 4.2, 25, -5.6, -3.6, 4.5, 1.5, 0, 0, 2, 21, 1.35),
      new VBRPresets(2, 9, 9, 0, 4.2, 25, -4.4, -1.8, 2, 2, 0, 0, 2, 18, 1.49),
      new VBRPresets(3, 9, 9, 1, 4.2, 25, -3.4, -1.25, 1.1, 3, -4, 0, 2, 15, 1.64),
      new VBRPresets(4, 9, 9, 1, 4.2, 25, -2.2, 0.1, 0, 3.5, -8, 0, 2, 0, 1.79),
      new VBRPresets(5, 9, 9, 1, 4.2, 25, -1, 1.65, -7.7, 4, -12, 2e-4, 0, 0, 1.95),
      new VBRPresets(6, 9, 9, 1, 4.2, 25, -0, 2.47, -7.7, 6.5, -19, 4e-4, 0, 0, 2),
      new VBRPresets(7, 9, 9, 1, 4.2, 25, 0.5, 2, -14.5, 8, -22, 6e-4, 0, 0, 2),
      new VBRPresets(8, 9, 9, 1, 4.2, 25, 1, 2.4, -22, 10, -23, 7e-4, 0, 0, 2),
      new VBRPresets(9, 9, 9, 1, 4.2, 25, 1.5, 2.95, -30, 11, -25, 8e-4, 0, 0, 2),
      new VBRPresets(10, 9, 9, 1, 4.2, 25, 2, 2.95, -36, 12, -30, 8e-4, 0, 0, 2)
    ];
    function apply_vbr_preset(gfp, a, enforce) {
      var vbr_preset = gfp.VBR == VbrMode.vbr_rh ? vbr_old_switch_map : vbr_psy_switch_map;
      var x = gfp.VBR_q_frac;
      var p = vbr_preset[a];
      var q = vbr_preset[a + 1];
      var set = p;
      p.st_lrm = p.st_lrm + x * (q.st_lrm - p.st_lrm);
      p.st_s = p.st_s + x * (q.st_s - p.st_s);
      p.masking_adj = p.masking_adj + x * (q.masking_adj - p.masking_adj);
      p.masking_adj_short = p.masking_adj_short + x * (q.masking_adj_short - p.masking_adj_short);
      p.ath_lower = p.ath_lower + x * (q.ath_lower - p.ath_lower);
      p.ath_curve = p.ath_curve + x * (q.ath_curve - p.ath_curve);
      p.ath_sensitivity = p.ath_sensitivity + x * (q.ath_sensitivity - p.ath_sensitivity);
      p.interch = p.interch + x * (q.interch - p.interch);
      p.msfix = p.msfix + x * (q.msfix - p.msfix);
      lame_set_VBR_q(gfp, set.vbr_q);
      if (enforce != 0)
        gfp.quant_comp = set.quant_comp;
      else if (!(Math.abs(gfp.quant_comp - -1) > 0))
        gfp.quant_comp = set.quant_comp;
      if (enforce != 0)
        gfp.quant_comp_short = set.quant_comp_s;
      else if (!(Math.abs(gfp.quant_comp_short - -1) > 0))
        gfp.quant_comp_short = set.quant_comp_s;
      if (set.expY != 0) {
        gfp.experimentalY = set.expY != 0;
      }
      if (enforce != 0)
        gfp.internal_flags.nsPsy.attackthre = set.st_lrm;
      else if (!(Math.abs(gfp.internal_flags.nsPsy.attackthre - -1) > 0))
        gfp.internal_flags.nsPsy.attackthre = set.st_lrm;
      if (enforce != 0)
        gfp.internal_flags.nsPsy.attackthre_s = set.st_s;
      else if (!(Math.abs(gfp.internal_flags.nsPsy.attackthre_s - -1) > 0))
        gfp.internal_flags.nsPsy.attackthre_s = set.st_s;
      if (enforce != 0)
        gfp.maskingadjust = set.masking_adj;
      else if (!(Math.abs(gfp.maskingadjust - 0) > 0))
        gfp.maskingadjust = set.masking_adj;
      if (enforce != 0)
        gfp.maskingadjust_short = set.masking_adj_short;
      else if (!(Math.abs(gfp.maskingadjust_short - 0) > 0))
        gfp.maskingadjust_short = set.masking_adj_short;
      if (enforce != 0)
        gfp.ATHlower = -set.ath_lower / 10;
      else if (!(Math.abs(-gfp.ATHlower * 10 - 0) > 0))
        gfp.ATHlower = -set.ath_lower / 10;
      if (enforce != 0)
        gfp.ATHcurve = set.ath_curve;
      else if (!(Math.abs(gfp.ATHcurve - -1) > 0))
        gfp.ATHcurve = set.ath_curve;
      if (enforce != 0)
        gfp.athaa_sensitivity = set.ath_sensitivity;
      else if (!(Math.abs(gfp.athaa_sensitivity - -1) > 0))
        gfp.athaa_sensitivity = set.ath_sensitivity;
      if (set.interch > 0) {
        if (enforce != 0)
          gfp.interChRatio = set.interch;
        else if (!(Math.abs(gfp.interChRatio - -1) > 0))
          gfp.interChRatio = set.interch;
      }
      if (set.safejoint > 0) {
        gfp.exp_nspsytune = gfp.exp_nspsytune | set.safejoint;
      }
      if (set.sfb21mod > 0) {
        gfp.exp_nspsytune = gfp.exp_nspsytune | set.sfb21mod << 20;
      }
      if (enforce != 0)
        gfp.msfix = set.msfix;
      else if (!(Math.abs(gfp.msfix - -1) > 0))
        gfp.msfix = set.msfix;
      if (enforce == 0) {
        gfp.VBR_q = a;
        gfp.VBR_q_frac = x;
      }
    }
    var abr_switch_map = [
      new ABRPresets(8, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -30, 11, 12e-4, 1),
      /*   8, impossible to use in stereo */
      new ABRPresets(16, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -25, 11, 1e-3, 1),
      /*  16 */
      new ABRPresets(24, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -20, 11, 1e-3, 1),
      /*  24 */
      new ABRPresets(32, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -15, 11, 1e-3, 1),
      /*  32 */
      new ABRPresets(40, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -10, 11, 9e-4, 1),
      /*  40 */
      new ABRPresets(48, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -10, 11, 9e-4, 1),
      /*  48 */
      new ABRPresets(56, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -6, 11, 8e-4, 1),
      /*  56 */
      new ABRPresets(64, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, -2, 11, 8e-4, 1),
      /*  64 */
      new ABRPresets(80, 9, 9, 0, 0, 6.6, 145, 0, 0.95, 0, 0, 8, 7e-4, 1),
      /*  80 */
      new ABRPresets(96, 9, 9, 0, 2.5, 6.6, 145, 0, 0.95, 0, 1, 5.5, 6e-4, 1),
      /*  96 */
      new ABRPresets(112, 9, 9, 0, 2.25, 6.6, 145, 0, 0.95, 0, 2, 4.5, 5e-4, 1),
      /* 112 */
      new ABRPresets(128, 9, 9, 0, 1.95, 6.4, 140, 0, 0.95, 0, 3, 4, 2e-4, 1),
      /* 128 */
      new ABRPresets(160, 9, 9, 1, 1.79, 6, 135, 0, 0.95, -2, 5, 3.5, 0, 1),
      /* 160 */
      new ABRPresets(192, 9, 9, 1, 1.49, 5.6, 125, 0, 0.97, -4, 7, 3, 0, 0),
      /* 192 */
      new ABRPresets(224, 9, 9, 1, 1.25, 5.2, 125, 0, 0.98, -6, 9, 2, 0, 0),
      /* 224 */
      new ABRPresets(256, 9, 9, 1, 0.97, 5.2, 125, 0, 1, -8, 10, 1, 0, 0),
      /* 256 */
      new ABRPresets(320, 9, 9, 1, 0.9, 5.2, 125, 0, 1, -10, 12, 0, 0, 0)
      /* 320 */
    ];
    function apply_abr_preset(gfp, preset, enforce) {
      var actual_bitrate = preset;
      var r = lame.nearestBitrateFullIndex(preset);
      gfp.VBR = VbrMode.vbr_abr;
      gfp.VBR_mean_bitrate_kbps = actual_bitrate;
      gfp.VBR_mean_bitrate_kbps = Math.min(gfp.VBR_mean_bitrate_kbps, 320);
      gfp.VBR_mean_bitrate_kbps = Math.max(gfp.VBR_mean_bitrate_kbps, 8);
      gfp.brate = gfp.VBR_mean_bitrate_kbps;
      if (gfp.VBR_mean_bitrate_kbps > 320) {
        gfp.disable_reservoir = true;
      }
      if (abr_switch_map[r].safejoint > 0)
        gfp.exp_nspsytune = gfp.exp_nspsytune | 2;
      if (abr_switch_map[r].sfscale > 0) {
        gfp.internal_flags.noise_shaping = 2;
      }
      if (Math.abs(abr_switch_map[r].nsbass) > 0) {
        var k = int(abr_switch_map[r].nsbass * 4);
        if (k < 0)
          k += 64;
        gfp.exp_nspsytune = gfp.exp_nspsytune | k << 2;
      }
      if (enforce != 0)
        gfp.quant_comp = abr_switch_map[r].quant_comp;
      else if (!(Math.abs(gfp.quant_comp - -1) > 0))
        gfp.quant_comp = abr_switch_map[r].quant_comp;
      if (enforce != 0)
        gfp.quant_comp_short = abr_switch_map[r].quant_comp_s;
      else if (!(Math.abs(gfp.quant_comp_short - -1) > 0))
        gfp.quant_comp_short = abr_switch_map[r].quant_comp_s;
      if (enforce != 0)
        gfp.msfix = abr_switch_map[r].nsmsfix;
      else if (!(Math.abs(gfp.msfix - -1) > 0))
        gfp.msfix = abr_switch_map[r].nsmsfix;
      if (enforce != 0)
        gfp.internal_flags.nsPsy.attackthre = abr_switch_map[r].st_lrm;
      else if (!(Math.abs(gfp.internal_flags.nsPsy.attackthre - -1) > 0))
        gfp.internal_flags.nsPsy.attackthre = abr_switch_map[r].st_lrm;
      if (enforce != 0)
        gfp.internal_flags.nsPsy.attackthre_s = abr_switch_map[r].st_s;
      else if (!(Math.abs(gfp.internal_flags.nsPsy.attackthre_s - -1) > 0))
        gfp.internal_flags.nsPsy.attackthre_s = abr_switch_map[r].st_s;
      if (enforce != 0)
        gfp.scale = abr_switch_map[r].scale;
      else if (!(Math.abs(gfp.scale - -1) > 0))
        gfp.scale = abr_switch_map[r].scale;
      if (enforce != 0)
        gfp.maskingadjust = abr_switch_map[r].masking_adj;
      else if (!(Math.abs(gfp.maskingadjust - 0) > 0))
        gfp.maskingadjust = abr_switch_map[r].masking_adj;
      if (abr_switch_map[r].masking_adj > 0) {
        if (enforce != 0)
          gfp.maskingadjust_short = abr_switch_map[r].masking_adj * 0.9;
        else if (!(Math.abs(gfp.maskingadjust_short - 0) > 0))
          gfp.maskingadjust_short = abr_switch_map[r].masking_adj * 0.9;
      } else {
        if (enforce != 0)
          gfp.maskingadjust_short = abr_switch_map[r].masking_adj * 1.1;
        else if (!(Math.abs(gfp.maskingadjust_short - 0) > 0))
          gfp.maskingadjust_short = abr_switch_map[r].masking_adj * 1.1;
      }
      if (enforce != 0)
        gfp.ATHlower = -abr_switch_map[r].ath_lower / 10;
      else if (!(Math.abs(-gfp.ATHlower * 10 - 0) > 0))
        gfp.ATHlower = -abr_switch_map[r].ath_lower / 10;
      if (enforce != 0)
        gfp.ATHcurve = abr_switch_map[r].ath_curve;
      else if (!(Math.abs(gfp.ATHcurve - -1) > 0))
        gfp.ATHcurve = abr_switch_map[r].ath_curve;
      if (enforce != 0)
        gfp.interChRatio = abr_switch_map[r].interch;
      else if (!(Math.abs(gfp.interChRatio - -1) > 0))
        gfp.interChRatio = abr_switch_map[r].interch;
      return preset;
    }
    this.apply_preset = function(gfp, preset, enforce) {
      switch (preset) {
        case Lame.R3MIX: {
          preset = Lame.V3;
          gfp.VBR = VbrMode.vbr_mtrh;
          break;
        }
        case Lame.MEDIUM: {
          preset = Lame.V4;
          gfp.VBR = VbrMode.vbr_rh;
          break;
        }
        case Lame.MEDIUM_FAST: {
          preset = Lame.V4;
          gfp.VBR = VbrMode.vbr_mtrh;
          break;
        }
        case Lame.STANDARD: {
          preset = Lame.V2;
          gfp.VBR = VbrMode.vbr_rh;
          break;
        }
        case Lame.STANDARD_FAST: {
          preset = Lame.V2;
          gfp.VBR = VbrMode.vbr_mtrh;
          break;
        }
        case Lame.EXTREME: {
          preset = Lame.V0;
          gfp.VBR = VbrMode.vbr_rh;
          break;
        }
        case Lame.EXTREME_FAST: {
          preset = Lame.V0;
          gfp.VBR = VbrMode.vbr_mtrh;
          break;
        }
        case Lame.INSANE: {
          preset = 320;
          gfp.preset = preset;
          apply_abr_preset(gfp, preset, enforce);
          gfp.VBR = VbrMode.vbr_off;
          return preset;
        }
      }
      gfp.preset = preset;
      {
        switch (preset) {
          case Lame.V9:
            apply_vbr_preset(gfp, 9, enforce);
            return preset;
          case Lame.V8:
            apply_vbr_preset(gfp, 8, enforce);
            return preset;
          case Lame.V7:
            apply_vbr_preset(gfp, 7, enforce);
            return preset;
          case Lame.V6:
            apply_vbr_preset(gfp, 6, enforce);
            return preset;
          case Lame.V5:
            apply_vbr_preset(gfp, 5, enforce);
            return preset;
          case Lame.V4:
            apply_vbr_preset(gfp, 4, enforce);
            return preset;
          case Lame.V3:
            apply_vbr_preset(gfp, 3, enforce);
            return preset;
          case Lame.V2:
            apply_vbr_preset(gfp, 2, enforce);
            return preset;
          case Lame.V1:
            apply_vbr_preset(gfp, 1, enforce);
            return preset;
          case Lame.V0:
            apply_vbr_preset(gfp, 0, enforce);
            return preset;
          default:
            break;
        }
      }
      if (8 <= preset && preset <= 320) {
        return apply_abr_preset(gfp, preset, enforce);
      }
      gfp.preset = 0;
      return preset;
    };
    function lame_set_VBR_q(gfp, VBR_q) {
      var ret = 0;
      if (0 > VBR_q) {
        ret = -1;
        VBR_q = 0;
      }
      if (9 < VBR_q) {
        ret = -1;
        VBR_q = 9;
      }
      gfp.VBR_q = VBR_q;
      gfp.VBR_q_frac = 0;
      return ret;
    }
  }
  function Takehiro() {
    var qupvt = null;
    this.qupvt = null;
    this.setModules = function(_qupvt) {
      this.qupvt = _qupvt;
      qupvt = _qupvt;
    };
    function Bits(b) {
      this.bits = 0 | b;
    }
    var subdv_table = [
      [0, 0],
      /* 0 bands */
      [0, 0],
      /* 1 bands */
      [0, 0],
      /* 2 bands */
      [0, 0],
      /* 3 bands */
      [0, 0],
      /* 4 bands */
      [0, 1],
      /* 5 bands */
      [1, 1],
      /* 6 bands */
      [1, 1],
      /* 7 bands */
      [1, 2],
      /* 8 bands */
      [2, 2],
      /* 9 bands */
      [2, 3],
      /* 10 bands */
      [2, 3],
      /* 11 bands */
      [3, 4],
      /* 12 bands */
      [3, 4],
      /* 13 bands */
      [3, 4],
      /* 14 bands */
      [4, 5],
      /* 15 bands */
      [4, 5],
      /* 16 bands */
      [4, 6],
      /* 17 bands */
      [5, 6],
      /* 18 bands */
      [5, 6],
      /* 19 bands */
      [5, 7],
      /* 20 bands */
      [6, 7],
      /* 21 bands */
      [6, 7]
      /* 22 bands */
    ];
    function quantize_lines_xrpow_01(l, istep, xr, xrPos, ix, ixPos) {
      var compareval0 = (1 - 0.4054) / istep;
      l = l >> 1;
      while (l-- != 0) {
        ix[ixPos++] = compareval0 > xr[xrPos++] ? 0 : 1;
        ix[ixPos++] = compareval0 > xr[xrPos++] ? 0 : 1;
      }
    }
    function quantize_lines_xrpow(l, istep, xr, xrPos, ix, ixPos) {
      l = l >> 1;
      var remaining = l % 2;
      l = l >> 1;
      while (l-- != 0) {
        var x0, x1, x2, x3;
        var rx0, rx1, rx2, rx3;
        x0 = xr[xrPos++] * istep;
        x1 = xr[xrPos++] * istep;
        rx0 = 0 | x0;
        x2 = xr[xrPos++] * istep;
        rx1 = 0 | x1;
        x3 = xr[xrPos++] * istep;
        rx2 = 0 | x2;
        x0 += qupvt.adj43[rx0];
        rx3 = 0 | x3;
        x1 += qupvt.adj43[rx1];
        ix[ixPos++] = 0 | x0;
        x2 += qupvt.adj43[rx2];
        ix[ixPos++] = 0 | x1;
        x3 += qupvt.adj43[rx3];
        ix[ixPos++] = 0 | x2;
        ix[ixPos++] = 0 | x3;
      }
      if (remaining != 0) {
        var x0, x1;
        var rx0, rx1;
        x0 = xr[xrPos++] * istep;
        x1 = xr[xrPos++] * istep;
        rx0 = 0 | x0;
        rx1 = 0 | x1;
        x0 += qupvt.adj43[rx0];
        x1 += qupvt.adj43[rx1];
        ix[ixPos++] = 0 | x0;
        ix[ixPos++] = 0 | x1;
      }
    }
    function quantize_xrpow(xp, pi, istep, codInfo, prevNoise) {
      var sfb;
      var sfbmax;
      var j = 0;
      var prev_data_use;
      var accumulate = 0;
      var accumulate01 = 0;
      var xpPos = 0;
      var iData = pi;
      var iDataPos = 0;
      var acc_iData = iData;
      var acc_iDataPos = 0;
      var acc_xp = xp;
      var acc_xpPos = 0;
      prev_data_use = prevNoise != null && codInfo.global_gain == prevNoise.global_gain;
      if (codInfo.block_type == Encoder.SHORT_TYPE)
        sfbmax = 38;
      else
        sfbmax = 21;
      for (sfb = 0; sfb <= sfbmax; sfb++) {
        var step = -1;
        if (prev_data_use || codInfo.block_type == Encoder.NORM_TYPE) {
          step = codInfo.global_gain - (codInfo.scalefac[sfb] + (codInfo.preflag != 0 ? qupvt.pretab[sfb] : 0) << codInfo.scalefac_scale + 1) - codInfo.subblock_gain[codInfo.window[sfb]] * 8;
        }
        if (prev_data_use && prevNoise.step[sfb] == step) {
          if (accumulate != 0) {
            quantize_lines_xrpow(
              accumulate,
              istep,
              acc_xp,
              acc_xpPos,
              acc_iData,
              acc_iDataPos
            );
            accumulate = 0;
          }
          if (accumulate01 != 0) {
            quantize_lines_xrpow_01(
              accumulate01,
              istep,
              acc_xp,
              acc_xpPos,
              acc_iData,
              acc_iDataPos
            );
            accumulate01 = 0;
          }
        } else {
          var l = codInfo.width[sfb];
          if (j + codInfo.width[sfb] > codInfo.max_nonzero_coeff) {
            var usefullsize;
            usefullsize = codInfo.max_nonzero_coeff - j + 1;
            Arrays.fill(pi, codInfo.max_nonzero_coeff, 576, 0);
            l = usefullsize;
            if (l < 0) {
              l = 0;
            }
            sfb = sfbmax + 1;
          }
          if (0 == accumulate && 0 == accumulate01) {
            acc_iData = iData;
            acc_iDataPos = iDataPos;
            acc_xp = xp;
            acc_xpPos = xpPos;
          }
          if (prevNoise != null && prevNoise.sfb_count1 > 0 && sfb >= prevNoise.sfb_count1 && prevNoise.step[sfb] > 0 && step >= prevNoise.step[sfb]) {
            if (accumulate != 0) {
              quantize_lines_xrpow(
                accumulate,
                istep,
                acc_xp,
                acc_xpPos,
                acc_iData,
                acc_iDataPos
              );
              accumulate = 0;
              acc_iData = iData;
              acc_iDataPos = iDataPos;
              acc_xp = xp;
              acc_xpPos = xpPos;
            }
            accumulate01 += l;
          } else {
            if (accumulate01 != 0) {
              quantize_lines_xrpow_01(
                accumulate01,
                istep,
                acc_xp,
                acc_xpPos,
                acc_iData,
                acc_iDataPos
              );
              accumulate01 = 0;
              acc_iData = iData;
              acc_iDataPos = iDataPos;
              acc_xp = xp;
              acc_xpPos = xpPos;
            }
            accumulate += l;
          }
          if (l <= 0) {
            if (accumulate01 != 0) {
              quantize_lines_xrpow_01(
                accumulate01,
                istep,
                acc_xp,
                acc_xpPos,
                acc_iData,
                acc_iDataPos
              );
              accumulate01 = 0;
            }
            if (accumulate != 0) {
              quantize_lines_xrpow(
                accumulate,
                istep,
                acc_xp,
                acc_xpPos,
                acc_iData,
                acc_iDataPos
              );
              accumulate = 0;
            }
            break;
          }
        }
        if (sfb <= sfbmax) {
          iDataPos += codInfo.width[sfb];
          xpPos += codInfo.width[sfb];
          j += codInfo.width[sfb];
        }
      }
      if (accumulate != 0) {
        quantize_lines_xrpow(
          accumulate,
          istep,
          acc_xp,
          acc_xpPos,
          acc_iData,
          acc_iDataPos
        );
        accumulate = 0;
      }
      if (accumulate01 != 0) {
        quantize_lines_xrpow_01(
          accumulate01,
          istep,
          acc_xp,
          acc_xpPos,
          acc_iData,
          acc_iDataPos
        );
        accumulate01 = 0;
      }
    }
    function ix_max(ix, ixPos, endPos) {
      var max1 = 0, max2 = 0;
      do {
        var x1 = ix[ixPos++];
        var x2 = ix[ixPos++];
        if (max1 < x1)
          max1 = x1;
        if (max2 < x2)
          max2 = x2;
      } while (ixPos < endPos);
      if (max1 < max2)
        max1 = max2;
      return max1;
    }
    function count_bit_ESC(ix, ixPos, end, t1, t2, s) {
      var linbits = Tables.ht[t1].xlen * 65536 + Tables.ht[t2].xlen;
      var sum = 0, sum2;
      do {
        var x = ix[ixPos++];
        var y = ix[ixPos++];
        if (x != 0) {
          if (x > 14) {
            x = 15;
            sum += linbits;
          }
          x *= 16;
        }
        if (y != 0) {
          if (y > 14) {
            y = 15;
            sum += linbits;
          }
          x += y;
        }
        sum += Tables.largetbl[x];
      } while (ixPos < end);
      sum2 = sum & 65535;
      sum >>= 16;
      if (sum > sum2) {
        sum = sum2;
        t1 = t2;
      }
      s.bits += sum;
      return t1;
    }
    function count_bit_noESC(ix, ixPos, end, s) {
      var sum1 = 0;
      var hlen1 = Tables.ht[1].hlen;
      do {
        var x = ix[ixPos + 0] * 2 + ix[ixPos + 1];
        ixPos += 2;
        sum1 += hlen1[x];
      } while (ixPos < end);
      s.bits += sum1;
      return 1;
    }
    function count_bit_noESC_from2(ix, ixPos, end, t1, s) {
      var sum = 0, sum2;
      var xlen = Tables.ht[t1].xlen;
      var hlen;
      if (t1 == 2)
        hlen = Tables.table23;
      else
        hlen = Tables.table56;
      do {
        var x = ix[ixPos + 0] * xlen + ix[ixPos + 1];
        ixPos += 2;
        sum += hlen[x];
      } while (ixPos < end);
      sum2 = sum & 65535;
      sum >>= 16;
      if (sum > sum2) {
        sum = sum2;
        t1++;
      }
      s.bits += sum;
      return t1;
    }
    function count_bit_noESC_from3(ix, ixPos, end, t1, s) {
      var sum1 = 0;
      var sum2 = 0;
      var sum3 = 0;
      var xlen = Tables.ht[t1].xlen;
      var hlen1 = Tables.ht[t1].hlen;
      var hlen2 = Tables.ht[t1 + 1].hlen;
      var hlen3 = Tables.ht[t1 + 2].hlen;
      do {
        var x = ix[ixPos + 0] * xlen + ix[ixPos + 1];
        ixPos += 2;
        sum1 += hlen1[x];
        sum2 += hlen2[x];
        sum3 += hlen3[x];
      } while (ixPos < end);
      var t = t1;
      if (sum1 > sum2) {
        sum1 = sum2;
        t++;
      }
      if (sum1 > sum3) {
        sum1 = sum3;
        t = t1 + 2;
      }
      s.bits += sum1;
      return t;
    }
    var huf_tbl_noESC = [
      1,
      2,
      5,
      7,
      7,
      10,
      10,
      13,
      13,
      13,
      13,
      13,
      13,
      13,
      13
    ];
    function choose_table(ix, ixPos, endPos, s) {
      var max = ix_max(ix, ixPos, endPos);
      switch (max) {
        case 0:
          return max;
        case 1:
          return count_bit_noESC(ix, ixPos, endPos, s);
        case 2:
        case 3:
          return count_bit_noESC_from2(
            ix,
            ixPos,
            endPos,
            huf_tbl_noESC[max - 1],
            s
          );
        case 4:
        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
        case 10:
        case 11:
        case 12:
        case 13:
        case 14:
        case 15:
          return count_bit_noESC_from3(
            ix,
            ixPos,
            endPos,
            huf_tbl_noESC[max - 1],
            s
          );
        default:
          if (max > QuantizePVT.IXMAX_VAL) {
            s.bits = QuantizePVT.LARGE_BITS;
            return -1;
          }
          max -= 15;
          var choice2;
          for (choice2 = 24; choice2 < 32; choice2++) {
            if (Tables.ht[choice2].linmax >= max) {
              break;
            }
          }
          var choice;
          for (choice = choice2 - 8; choice < 24; choice++) {
            if (Tables.ht[choice].linmax >= max) {
              break;
            }
          }
          return count_bit_ESC(ix, ixPos, endPos, choice, choice2, s);
      }
    }
    this.noquant_count_bits = function(gfc, gi, prev_noise) {
      var ix = gi.l3_enc;
      var i = Math.min(576, gi.max_nonzero_coeff + 2 >> 1 << 1);
      if (prev_noise != null)
        prev_noise.sfb_count1 = 0;
      for (; i > 1; i -= 2)
        if ((ix[i - 1] | ix[i - 2]) != 0)
          break;
      gi.count1 = i;
      var a1 = 0;
      var a2 = 0;
      for (; i > 3; i -= 4) {
        var p;
        if (((ix[i - 1] | ix[i - 2] | ix[i - 3] | ix[i - 4]) & 2147483647) > 1) {
          break;
        }
        p = ((ix[i - 4] * 2 + ix[i - 3]) * 2 + ix[i - 2]) * 2 + ix[i - 1];
        a1 += Tables.t32l[p];
        a2 += Tables.t33l[p];
      }
      var bits = a1;
      gi.count1table_select = 0;
      if (a1 > a2) {
        bits = a2;
        gi.count1table_select = 1;
      }
      gi.count1bits = bits;
      gi.big_values = i;
      if (i == 0)
        return bits;
      if (gi.block_type == Encoder.SHORT_TYPE) {
        a1 = 3 * gfc.scalefac_band.s[3];
        if (a1 > gi.big_values)
          a1 = gi.big_values;
        a2 = gi.big_values;
      } else if (gi.block_type == Encoder.NORM_TYPE) {
        a1 = gi.region0_count = gfc.bv_scf[i - 2];
        a2 = gi.region1_count = gfc.bv_scf[i - 1];
        a2 = gfc.scalefac_band.l[a1 + a2 + 2];
        a1 = gfc.scalefac_band.l[a1 + 1];
        if (a2 < i) {
          var bi = new Bits(bits);
          gi.table_select[2] = choose_table(ix, a2, i, bi);
          bits = bi.bits;
        }
      } else {
        gi.region0_count = 7;
        gi.region1_count = Encoder.SBMAX_l - 1 - 7 - 1;
        a1 = gfc.scalefac_band.l[7 + 1];
        a2 = i;
        if (a1 > a2) {
          a1 = a2;
        }
      }
      a1 = Math.min(a1, i);
      a2 = Math.min(a2, i);
      if (0 < a1) {
        var bi = new Bits(bits);
        gi.table_select[0] = choose_table(ix, 0, a1, bi);
        bits = bi.bits;
      }
      if (a1 < a2) {
        var bi = new Bits(bits);
        gi.table_select[1] = choose_table(ix, a1, a2, bi);
        bits = bi.bits;
      }
      if (gfc.use_best_huffman == 2) {
        gi.part2_3_length = bits;
        best_huffman_divide(gfc, gi);
        bits = gi.part2_3_length;
      }
      if (prev_noise != null) {
        if (gi.block_type == Encoder.NORM_TYPE) {
          var sfb = 0;
          while (gfc.scalefac_band.l[sfb] < gi.big_values) {
            sfb++;
          }
          prev_noise.sfb_count1 = sfb;
        }
      }
      return bits;
    };
    this.count_bits = function(gfc, xr, gi, prev_noise) {
      var ix = gi.l3_enc;
      var w = QuantizePVT.IXMAX_VAL / qupvt.IPOW20(gi.global_gain);
      if (gi.xrpow_max > w)
        return QuantizePVT.LARGE_BITS;
      quantize_xrpow(xr, ix, qupvt.IPOW20(gi.global_gain), gi, prev_noise);
      if ((gfc.substep_shaping & 2) != 0) {
        var j = 0;
        var gain = gi.global_gain + gi.scalefac_scale;
        var roundfac = 0.634521682242439 / qupvt.IPOW20(gain);
        for (var sfb = 0; sfb < gi.sfbmax; sfb++) {
          var width = gi.width[sfb];
          if (0 == gfc.pseudohalf[sfb]) {
            j += width;
          } else {
            var k;
            for (k = j, j += width; k < j; ++k) {
              ix[k] = xr[k] >= roundfac ? ix[k] : 0;
            }
          }
        }
      }
      return this.noquant_count_bits(gfc, gi, prev_noise);
    };
    function recalc_divide_init(gfc, cod_info, ix, r01_bits, r01_div, r0_tbl, r1_tbl) {
      var bigv = cod_info.big_values;
      for (var r0 = 0; r0 <= 7 + 15; r0++) {
        r01_bits[r0] = QuantizePVT.LARGE_BITS;
      }
      for (var r0 = 0; r0 < 16; r0++) {
        var a1 = gfc.scalefac_band.l[r0 + 1];
        if (a1 >= bigv)
          break;
        var r0bits = 0;
        var bi = new Bits(r0bits);
        var r0t = choose_table(ix, 0, a1, bi);
        r0bits = bi.bits;
        for (var r1 = 0; r1 < 8; r1++) {
          var a2 = gfc.scalefac_band.l[r0 + r1 + 2];
          if (a2 >= bigv)
            break;
          var bits = r0bits;
          bi = new Bits(bits);
          var r1t = choose_table(ix, a1, a2, bi);
          bits = bi.bits;
          if (r01_bits[r0 + r1] > bits) {
            r01_bits[r0 + r1] = bits;
            r01_div[r0 + r1] = r0;
            r0_tbl[r0 + r1] = r0t;
            r1_tbl[r0 + r1] = r1t;
          }
        }
      }
    }
    function recalc_divide_sub(gfc, cod_info2, gi, ix, r01_bits, r01_div, r0_tbl, r1_tbl) {
      var bigv = cod_info2.big_values;
      for (var r2 = 2; r2 < Encoder.SBMAX_l + 1; r2++) {
        var a2 = gfc.scalefac_band.l[r2];
        if (a2 >= bigv)
          break;
        var bits = r01_bits[r2 - 2] + cod_info2.count1bits;
        if (gi.part2_3_length <= bits)
          break;
        var bi = new Bits(bits);
        var r2t = choose_table(ix, a2, bigv, bi);
        bits = bi.bits;
        if (gi.part2_3_length <= bits)
          continue;
        gi.assign(cod_info2);
        gi.part2_3_length = bits;
        gi.region0_count = r01_div[r2 - 2];
        gi.region1_count = r2 - 2 - r01_div[r2 - 2];
        gi.table_select[0] = r0_tbl[r2 - 2];
        gi.table_select[1] = r1_tbl[r2 - 2];
        gi.table_select[2] = r2t;
      }
    }
    this.best_huffman_divide = function(gfc, gi) {
      var cod_info2 = new GrInfo();
      var ix = gi.l3_enc;
      var r01_bits = new_int(7 + 15 + 1);
      var r01_div = new_int(7 + 15 + 1);
      var r0_tbl = new_int(7 + 15 + 1);
      var r1_tbl = new_int(7 + 15 + 1);
      if (gi.block_type == Encoder.SHORT_TYPE && gfc.mode_gr == 1)
        return;
      cod_info2.assign(gi);
      if (gi.block_type == Encoder.NORM_TYPE) {
        recalc_divide_init(gfc, gi, ix, r01_bits, r01_div, r0_tbl, r1_tbl);
        recalc_divide_sub(
          gfc,
          cod_info2,
          gi,
          ix,
          r01_bits,
          r01_div,
          r0_tbl,
          r1_tbl
        );
      }
      var i = cod_info2.big_values;
      if (i == 0 || (ix[i - 2] | ix[i - 1]) > 1)
        return;
      i = gi.count1 + 2;
      if (i > 576)
        return;
      cod_info2.assign(gi);
      cod_info2.count1 = i;
      var a1 = 0;
      var a2 = 0;
      for (; i > cod_info2.big_values; i -= 4) {
        var p = ((ix[i - 4] * 2 + ix[i - 3]) * 2 + ix[i - 2]) * 2 + ix[i - 1];
        a1 += Tables.t32l[p];
        a2 += Tables.t33l[p];
      }
      cod_info2.big_values = i;
      cod_info2.count1table_select = 0;
      if (a1 > a2) {
        a1 = a2;
        cod_info2.count1table_select = 1;
      }
      cod_info2.count1bits = a1;
      if (cod_info2.block_type == Encoder.NORM_TYPE)
        recalc_divide_sub(
          gfc,
          cod_info2,
          gi,
          ix,
          r01_bits,
          r01_div,
          r0_tbl,
          r1_tbl
        );
      else {
        cod_info2.part2_3_length = a1;
        a1 = gfc.scalefac_band.l[7 + 1];
        if (a1 > i) {
          a1 = i;
        }
        if (a1 > 0) {
          var bi = new Bits(cod_info2.part2_3_length);
          cod_info2.table_select[0] = choose_table(ix, 0, a1, bi);
          cod_info2.part2_3_length = bi.bits;
        }
        if (i > a1) {
          var bi = new Bits(cod_info2.part2_3_length);
          cod_info2.table_select[1] = choose_table(ix, a1, i, bi);
          cod_info2.part2_3_length = bi.bits;
        }
        if (gi.part2_3_length > cod_info2.part2_3_length)
          gi.assign(cod_info2);
      }
    };
    var slen1_n = [1, 1, 1, 1, 8, 2, 2, 2, 4, 4, 4, 8, 8, 8, 16, 16];
    var slen2_n = [1, 2, 4, 8, 1, 2, 4, 8, 2, 4, 8, 2, 4, 8, 4, 8];
    var slen1_tab = [0, 0, 0, 0, 3, 1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4];
    var slen2_tab = [0, 1, 2, 3, 0, 1, 2, 3, 1, 2, 3, 1, 2, 3, 2, 3];
    Takehiro.slen1_tab = slen1_tab;
    Takehiro.slen2_tab = slen2_tab;
    function scfsi_calc(ch, l3_side) {
      var sfb;
      var gi = l3_side.tt[1][ch];
      var g0 = l3_side.tt[0][ch];
      for (var i = 0; i < Tables.scfsi_band.length - 1; i++) {
        for (sfb = Tables.scfsi_band[i]; sfb < Tables.scfsi_band[i + 1]; sfb++) {
          if (g0.scalefac[sfb] != gi.scalefac[sfb] && gi.scalefac[sfb] >= 0)
            break;
        }
        if (sfb == Tables.scfsi_band[i + 1]) {
          for (sfb = Tables.scfsi_band[i]; sfb < Tables.scfsi_band[i + 1]; sfb++) {
            gi.scalefac[sfb] = -1;
          }
          l3_side.scfsi[ch][i] = 1;
        }
      }
      var s1 = 0;
      var c1 = 0;
      for (sfb = 0; sfb < 11; sfb++) {
        if (gi.scalefac[sfb] == -1)
          continue;
        c1++;
        if (s1 < gi.scalefac[sfb])
          s1 = gi.scalefac[sfb];
      }
      var s2 = 0;
      var c2 = 0;
      for (; sfb < Encoder.SBPSY_l; sfb++) {
        if (gi.scalefac[sfb] == -1)
          continue;
        c2++;
        if (s2 < gi.scalefac[sfb])
          s2 = gi.scalefac[sfb];
      }
      for (var i = 0; i < 16; i++) {
        if (s1 < slen1_n[i] && s2 < slen2_n[i]) {
          var c = slen1_tab[i] * c1 + slen2_tab[i] * c2;
          if (gi.part2_length > c) {
            gi.part2_length = c;
            gi.scalefac_compress = i;
          }
        }
      }
    }
    this.best_scalefac_store = function(gfc, gr, ch, l3_side) {
      var gi = l3_side.tt[gr][ch];
      var sfb, i, j, l;
      var recalc = 0;
      j = 0;
      for (sfb = 0; sfb < gi.sfbmax; sfb++) {
        var width = gi.width[sfb];
        j += width;
        for (l = -width; l < 0; l++) {
          if (gi.l3_enc[l + j] != 0)
            break;
        }
        if (l == 0)
          gi.scalefac[sfb] = recalc = -2;
      }
      if (0 == gi.scalefac_scale && 0 == gi.preflag) {
        var s = 0;
        for (sfb = 0; sfb < gi.sfbmax; sfb++)
          if (gi.scalefac[sfb] > 0)
            s |= gi.scalefac[sfb];
        if (0 == (s & 1) && s != 0) {
          for (sfb = 0; sfb < gi.sfbmax; sfb++)
            if (gi.scalefac[sfb] > 0)
              gi.scalefac[sfb] >>= 1;
          gi.scalefac_scale = recalc = 1;
        }
      }
      if (0 == gi.preflag && gi.block_type != Encoder.SHORT_TYPE && gfc.mode_gr == 2) {
        for (sfb = 11; sfb < Encoder.SBPSY_l; sfb++)
          if (gi.scalefac[sfb] < qupvt.pretab[sfb] && gi.scalefac[sfb] != -2)
            break;
        if (sfb == Encoder.SBPSY_l) {
          for (sfb = 11; sfb < Encoder.SBPSY_l; sfb++)
            if (gi.scalefac[sfb] > 0)
              gi.scalefac[sfb] -= qupvt.pretab[sfb];
          gi.preflag = recalc = 1;
        }
      }
      for (i = 0; i < 4; i++)
        l3_side.scfsi[ch][i] = 0;
      if (gfc.mode_gr == 2 && gr == 1 && l3_side.tt[0][ch].block_type != Encoder.SHORT_TYPE && l3_side.tt[1][ch].block_type != Encoder.SHORT_TYPE) {
        scfsi_calc(ch, l3_side);
        recalc = 0;
      }
      for (sfb = 0; sfb < gi.sfbmax; sfb++) {
        if (gi.scalefac[sfb] == -2) {
          gi.scalefac[sfb] = 0;
        }
      }
      if (recalc != 0) {
        if (gfc.mode_gr == 2) {
          this.scale_bitcount(gi);
        } else {
          this.scale_bitcount_lsf(gfc, gi);
        }
      }
    };
    function all_scalefactors_not_negative(scalefac, n) {
      for (var i = 0; i < n; ++i) {
        if (scalefac[i] < 0)
          return false;
      }
      return true;
    }
    var scale_short = [
      0,
      18,
      36,
      54,
      54,
      36,
      54,
      72,
      54,
      72,
      90,
      72,
      90,
      108,
      108,
      126
    ];
    var scale_mixed = [
      0,
      18,
      36,
      54,
      51,
      35,
      53,
      71,
      52,
      70,
      88,
      69,
      87,
      105,
      104,
      122
    ];
    var scale_long = [
      0,
      10,
      20,
      30,
      33,
      21,
      31,
      41,
      32,
      42,
      52,
      43,
      53,
      63,
      64,
      74
    ];
    this.scale_bitcount = function(cod_info) {
      var k, sfb, max_slen1 = 0, max_slen2 = 0;
      var tab;
      var scalefac = cod_info.scalefac;
      if (cod_info.block_type == Encoder.SHORT_TYPE) {
        tab = scale_short;
        if (cod_info.mixed_block_flag != 0)
          tab = scale_mixed;
      } else {
        tab = scale_long;
        if (0 == cod_info.preflag) {
          for (sfb = 11; sfb < Encoder.SBPSY_l; sfb++)
            if (scalefac[sfb] < qupvt.pretab[sfb])
              break;
          if (sfb == Encoder.SBPSY_l) {
            cod_info.preflag = 1;
            for (sfb = 11; sfb < Encoder.SBPSY_l; sfb++)
              scalefac[sfb] -= qupvt.pretab[sfb];
          }
        }
      }
      for (sfb = 0; sfb < cod_info.sfbdivide; sfb++)
        if (max_slen1 < scalefac[sfb])
          max_slen1 = scalefac[sfb];
      for (; sfb < cod_info.sfbmax; sfb++)
        if (max_slen2 < scalefac[sfb])
          max_slen2 = scalefac[sfb];
      cod_info.part2_length = QuantizePVT.LARGE_BITS;
      for (k = 0; k < 16; k++) {
        if (max_slen1 < slen1_n[k] && max_slen2 < slen2_n[k] && cod_info.part2_length > tab[k]) {
          cod_info.part2_length = tab[k];
          cod_info.scalefac_compress = k;
        }
      }
      return cod_info.part2_length == QuantizePVT.LARGE_BITS;
    };
    var max_range_sfac_tab = [
      [15, 15, 7, 7],
      [15, 15, 7, 0],
      [7, 3, 0, 0],
      [15, 31, 31, 0],
      [7, 7, 7, 0],
      [3, 3, 0, 0]
    ];
    this.scale_bitcount_lsf = function(gfc, cod_info) {
      var table_number, row_in_table, partition, nr_sfb, window;
      var over;
      var i, sfb;
      var max_sfac = new_int(4);
      var scalefac = cod_info.scalefac;
      if (cod_info.preflag != 0)
        table_number = 2;
      else
        table_number = 0;
      for (i = 0; i < 4; i++)
        max_sfac[i] = 0;
      if (cod_info.block_type == Encoder.SHORT_TYPE) {
        row_in_table = 1;
        var partition_table = qupvt.nr_of_sfb_block[table_number][row_in_table];
        for (sfb = 0, partition = 0; partition < 4; partition++) {
          nr_sfb = partition_table[partition] / 3;
          for (i = 0; i < nr_sfb; i++, sfb++)
            for (window = 0; window < 3; window++)
              if (scalefac[sfb * 3 + window] > max_sfac[partition])
                max_sfac[partition] = scalefac[sfb * 3 + window];
        }
      } else {
        row_in_table = 0;
        var partition_table = qupvt.nr_of_sfb_block[table_number][row_in_table];
        for (sfb = 0, partition = 0; partition < 4; partition++) {
          nr_sfb = partition_table[partition];
          for (i = 0; i < nr_sfb; i++, sfb++)
            if (scalefac[sfb] > max_sfac[partition])
              max_sfac[partition] = scalefac[sfb];
        }
      }
      for (over = false, partition = 0; partition < 4; partition++) {
        if (max_sfac[partition] > max_range_sfac_tab[table_number][partition])
          over = true;
      }
      if (!over) {
        var slen1, slen2, slen3, slen4;
        cod_info.sfb_partition_table = qupvt.nr_of_sfb_block[table_number][row_in_table];
        for (partition = 0; partition < 4; partition++)
          cod_info.slen[partition] = log2tab[max_sfac[partition]];
        slen1 = cod_info.slen[0];
        slen2 = cod_info.slen[1];
        slen3 = cod_info.slen[2];
        slen4 = cod_info.slen[3];
        switch (table_number) {
          case 0:
            cod_info.scalefac_compress = (slen1 * 5 + slen2 << 4) + (slen3 << 2) + slen4;
            break;
          case 1:
            cod_info.scalefac_compress = 400 + (slen1 * 5 + slen2 << 2) + slen3;
            break;
          case 2:
            cod_info.scalefac_compress = 500 + slen1 * 3 + slen2;
            break;
          default:
            System.err.printf("intensity stereo not implemented yet\n");
            break;
        }
      }
      if (!over) {
        cod_info.part2_length = 0;
        for (partition = 0; partition < 4; partition++)
          cod_info.part2_length += cod_info.slen[partition] * cod_info.sfb_partition_table[partition];
      }
      return over;
    };
    var log2tab = [
      0,
      1,
      2,
      2,
      3,
      3,
      3,
      3,
      4,
      4,
      4,
      4,
      4,
      4,
      4,
      4
    ];
    this.huffman_init = function(gfc) {
      for (var i = 2; i <= 576; i += 2) {
        var scfb_anz = 0, bv_index;
        while (gfc.scalefac_band.l[++scfb_anz] < i)
          ;
        bv_index = subdv_table[scfb_anz][0];
        while (gfc.scalefac_band.l[bv_index + 1] > i)
          bv_index--;
        if (bv_index < 0) {
          bv_index = subdv_table[scfb_anz][0];
        }
        gfc.bv_scf[i - 2] = bv_index;
        bv_index = subdv_table[scfb_anz][1];
        while (gfc.scalefac_band.l[bv_index + gfc.bv_scf[i - 2] + 2] > i)
          bv_index--;
        if (bv_index < 0) {
          bv_index = subdv_table[scfb_anz][1];
        }
        gfc.bv_scf[i - 1] = bv_index;
      }
    };
  }
  function Reservoir() {
    var bs;
    this.setModules = function(_bs) {
      bs = _bs;
    };
    this.ResvFrameBegin = function(gfp, mean_bits) {
      var gfc = gfp.internal_flags;
      var maxmp3buf;
      var l3_side = gfc.l3_side;
      var frameLength = bs.getframebits(gfp);
      mean_bits.bits = (frameLength - gfc.sideinfo_len * 8) / gfc.mode_gr;
      var resvLimit = 8 * 256 * gfc.mode_gr - 8;
      if (gfp.brate > 320) {
        maxmp3buf = 8 * int(gfp.brate * 1e3 / (gfp.out_samplerate / 1152) / 8 + 0.5);
      } else {
        maxmp3buf = 8 * 1440;
        if (gfp.strict_ISO) {
          maxmp3buf = 8 * int(32e4 / (gfp.out_samplerate / 1152) / 8 + 0.5);
        }
      }
      gfc.ResvMax = maxmp3buf - frameLength;
      if (gfc.ResvMax > resvLimit)
        gfc.ResvMax = resvLimit;
      if (gfc.ResvMax < 0 || gfp.disable_reservoir)
        gfc.ResvMax = 0;
      var fullFrameBits = mean_bits.bits * gfc.mode_gr + Math.min(gfc.ResvSize, gfc.ResvMax);
      if (fullFrameBits > maxmp3buf)
        fullFrameBits = maxmp3buf;
      l3_side.resvDrain_pre = 0;
      if (gfc.pinfo != null) {
        gfc.pinfo.mean_bits = mean_bits.bits / 2;
        gfc.pinfo.resvsize = gfc.ResvSize;
      }
      return fullFrameBits;
    };
    this.ResvMaxBits = function(gfp, mean_bits, targ_bits, cbr) {
      var gfc = gfp.internal_flags;
      var add_bits;
      var ResvSize = gfc.ResvSize, ResvMax = gfc.ResvMax;
      if (cbr != 0)
        ResvSize += mean_bits;
      if ((gfc.substep_shaping & 1) != 0)
        ResvMax *= 0.9;
      targ_bits.bits = mean_bits;
      if (ResvSize * 10 > ResvMax * 9) {
        add_bits = ResvSize - ResvMax * 9 / 10;
        targ_bits.bits += add_bits;
        gfc.substep_shaping |= 128;
      } else {
        add_bits = 0;
        gfc.substep_shaping &= 127;
        if (!gfp.disable_reservoir && 0 == (gfc.substep_shaping & 1))
          targ_bits.bits -= 0.1 * mean_bits;
      }
      var extra_bits = ResvSize < gfc.ResvMax * 6 / 10 ? ResvSize : gfc.ResvMax * 6 / 10;
      extra_bits -= add_bits;
      if (extra_bits < 0)
        extra_bits = 0;
      return extra_bits;
    };
    this.ResvAdjust = function(gfc, gi) {
      gfc.ResvSize -= gi.part2_3_length + gi.part2_length;
    };
    this.ResvFrameEnd = function(gfc, mean_bits) {
      var over_bits;
      var l3_side = gfc.l3_side;
      gfc.ResvSize += mean_bits * gfc.mode_gr;
      var stuffingBits = 0;
      l3_side.resvDrain_post = 0;
      l3_side.resvDrain_pre = 0;
      if ((over_bits = gfc.ResvSize % 8) != 0)
        stuffingBits += over_bits;
      over_bits = gfc.ResvSize - stuffingBits - gfc.ResvMax;
      if (over_bits > 0) {
        stuffingBits += over_bits;
      }
      {
        var mdb_bytes = Math.min(l3_side.main_data_begin * 8, stuffingBits) / 8;
        l3_side.resvDrain_pre += 8 * mdb_bytes;
        stuffingBits -= 8 * mdb_bytes;
        gfc.ResvSize -= 8 * mdb_bytes;
        l3_side.main_data_begin -= mdb_bytes;
      }
      l3_side.resvDrain_post += stuffingBits;
      gfc.ResvSize -= stuffingBits;
    };
  }
  BitStream.EQ = function(a, b) {
    return Math.abs(a) > Math.abs(b) ? Math.abs(a - b) <= Math.abs(a) * 1e-6 : Math.abs(a - b) <= Math.abs(b) * 1e-6;
  };
  BitStream.NEQ = function(a, b) {
    return !BitStream.EQ(a, b);
  };
  function BitStream() {
    var self = this;
    var CRC16_POLYNOMIAL = 32773;
    var MAX_LENGTH = 32;
    var ga = null;
    var mpg = null;
    var ver = null;
    var vbr = null;
    this.setModules = function(_ga, _mpg, _ver, _vbr) {
      ga = _ga;
      mpg = _mpg;
      ver = _ver;
      vbr = _vbr;
    };
    var buf = null;
    var totbit = 0;
    var bufByteIdx = 0;
    var bufBitIdx = 0;
    this.getframebits = function(gfp) {
      var gfc = gfp.internal_flags;
      var bit_rate;
      if (gfc.bitrate_index != 0)
        bit_rate = Tables.bitrate_table[gfp.version][gfc.bitrate_index];
      else
        bit_rate = gfp.brate;
      var bytes = 0 | (gfp.version + 1) * 72e3 * bit_rate / gfp.out_samplerate + gfc.padding;
      return 8 * bytes;
    };
    function putheader_bits(gfc) {
      System.arraycopy(gfc.header[gfc.w_ptr].buf, 0, buf, bufByteIdx, gfc.sideinfo_len);
      bufByteIdx += gfc.sideinfo_len;
      totbit += gfc.sideinfo_len * 8;
      gfc.w_ptr = gfc.w_ptr + 1 & LameInternalFlags.MAX_HEADER_BUF - 1;
    }
    function putbits2(gfc, val, j) {
      while (j > 0) {
        var k;
        if (bufBitIdx == 0) {
          bufBitIdx = 8;
          bufByteIdx++;
          if (gfc.header[gfc.w_ptr].write_timing == totbit) {
            putheader_bits(gfc);
          }
          buf[bufByteIdx] = 0;
        }
        k = Math.min(j, bufBitIdx);
        j -= k;
        bufBitIdx -= k;
        buf[bufByteIdx] |= val >> j << bufBitIdx;
        totbit += k;
      }
    }
    function putbits_noheaders(gfc, val, j) {
      while (j > 0) {
        var k;
        if (bufBitIdx == 0) {
          bufBitIdx = 8;
          bufByteIdx++;
          buf[bufByteIdx] = 0;
        }
        k = Math.min(j, bufBitIdx);
        j -= k;
        bufBitIdx -= k;
        buf[bufByteIdx] |= val >> j << bufBitIdx;
        totbit += k;
      }
    }
    function drain_into_ancillary(gfp, remainingBits) {
      var gfc = gfp.internal_flags;
      var i;
      if (remainingBits >= 8) {
        putbits2(gfc, 76, 8);
        remainingBits -= 8;
      }
      if (remainingBits >= 8) {
        putbits2(gfc, 65, 8);
        remainingBits -= 8;
      }
      if (remainingBits >= 8) {
        putbits2(gfc, 77, 8);
        remainingBits -= 8;
      }
      if (remainingBits >= 8) {
        putbits2(gfc, 69, 8);
        remainingBits -= 8;
      }
      if (remainingBits >= 32) {
        var version = ver.getLameShortVersion();
        if (remainingBits >= 32)
          for (i = 0; i < version.length && remainingBits >= 8; ++i) {
            remainingBits -= 8;
            putbits2(gfc, version.charAt(i), 8);
          }
      }
      for (; remainingBits >= 1; remainingBits -= 1) {
        putbits2(gfc, gfc.ancillary_flag, 1);
        gfc.ancillary_flag ^= !gfp.disable_reservoir ? 1 : 0;
      }
    }
    function writeheader(gfc, val, j) {
      var ptr = gfc.header[gfc.h_ptr].ptr;
      while (j > 0) {
        var k = Math.min(j, 8 - (ptr & 7));
        j -= k;
        gfc.header[gfc.h_ptr].buf[ptr >> 3] |= val >> j << 8 - (ptr & 7) - k;
        ptr += k;
      }
      gfc.header[gfc.h_ptr].ptr = ptr;
    }
    function CRC_update(value, crc) {
      value <<= 8;
      for (var i = 0; i < 8; i++) {
        value <<= 1;
        crc <<= 1;
        if (((crc ^ value) & 65536) != 0)
          crc ^= CRC16_POLYNOMIAL;
      }
      return crc;
    }
    this.CRC_writeheader = function(gfc, header) {
      var crc = 65535;
      crc = CRC_update(header[2] & 255, crc);
      crc = CRC_update(header[3] & 255, crc);
      for (var i = 6; i < gfc.sideinfo_len; i++) {
        crc = CRC_update(header[i] & 255, crc);
      }
      header[4] = byte(crc >> 8);
      header[5] = byte(crc & 255);
    };
    function encodeSideInfo2(gfp, bitsPerFrame) {
      var gfc = gfp.internal_flags;
      var l3_side;
      var gr, ch;
      l3_side = gfc.l3_side;
      gfc.header[gfc.h_ptr].ptr = 0;
      Arrays.fill(gfc.header[gfc.h_ptr].buf, 0, gfc.sideinfo_len, 0);
      if (gfp.out_samplerate < 16e3)
        writeheader(gfc, 4094, 12);
      else
        writeheader(gfc, 4095, 12);
      writeheader(gfc, gfp.version, 1);
      writeheader(gfc, 4 - 3, 2);
      writeheader(gfc, !gfp.error_protection ? 1 : 0, 1);
      writeheader(gfc, gfc.bitrate_index, 4);
      writeheader(gfc, gfc.samplerate_index, 2);
      writeheader(gfc, gfc.padding, 1);
      writeheader(gfc, gfp.extension, 1);
      writeheader(gfc, gfp.mode.ordinal(), 2);
      writeheader(gfc, gfc.mode_ext, 2);
      writeheader(gfc, gfp.copyright, 1);
      writeheader(gfc, gfp.original, 1);
      writeheader(gfc, gfp.emphasis, 2);
      if (gfp.error_protection) {
        writeheader(gfc, 0, 16);
      }
      if (gfp.version == 1) {
        writeheader(gfc, l3_side.main_data_begin, 9);
        if (gfc.channels_out == 2)
          writeheader(gfc, l3_side.private_bits, 3);
        else
          writeheader(gfc, l3_side.private_bits, 5);
        for (ch = 0; ch < gfc.channels_out; ch++) {
          var band;
          for (band = 0; band < 4; band++) {
            writeheader(gfc, l3_side.scfsi[ch][band], 1);
          }
        }
        for (gr = 0; gr < 2; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            var gi = l3_side.tt[gr][ch];
            writeheader(gfc, gi.part2_3_length + gi.part2_length, 12);
            writeheader(gfc, gi.big_values / 2, 9);
            writeheader(gfc, gi.global_gain, 8);
            writeheader(gfc, gi.scalefac_compress, 4);
            if (gi.block_type != Encoder.NORM_TYPE) {
              writeheader(gfc, 1, 1);
              writeheader(gfc, gi.block_type, 2);
              writeheader(gfc, gi.mixed_block_flag, 1);
              if (gi.table_select[0] == 14)
                gi.table_select[0] = 16;
              writeheader(gfc, gi.table_select[0], 5);
              if (gi.table_select[1] == 14)
                gi.table_select[1] = 16;
              writeheader(gfc, gi.table_select[1], 5);
              writeheader(gfc, gi.subblock_gain[0], 3);
              writeheader(gfc, gi.subblock_gain[1], 3);
              writeheader(gfc, gi.subblock_gain[2], 3);
            } else {
              writeheader(gfc, 0, 1);
              if (gi.table_select[0] == 14)
                gi.table_select[0] = 16;
              writeheader(gfc, gi.table_select[0], 5);
              if (gi.table_select[1] == 14)
                gi.table_select[1] = 16;
              writeheader(gfc, gi.table_select[1], 5);
              if (gi.table_select[2] == 14)
                gi.table_select[2] = 16;
              writeheader(gfc, gi.table_select[2], 5);
              writeheader(gfc, gi.region0_count, 4);
              writeheader(gfc, gi.region1_count, 3);
            }
            writeheader(gfc, gi.preflag, 1);
            writeheader(gfc, gi.scalefac_scale, 1);
            writeheader(gfc, gi.count1table_select, 1);
          }
        }
      } else {
        writeheader(gfc, l3_side.main_data_begin, 8);
        writeheader(gfc, l3_side.private_bits, gfc.channels_out);
        gr = 0;
        for (ch = 0; ch < gfc.channels_out; ch++) {
          var gi = l3_side.tt[gr][ch];
          writeheader(gfc, gi.part2_3_length + gi.part2_length, 12);
          writeheader(gfc, gi.big_values / 2, 9);
          writeheader(gfc, gi.global_gain, 8);
          writeheader(gfc, gi.scalefac_compress, 9);
          if (gi.block_type != Encoder.NORM_TYPE) {
            writeheader(gfc, 1, 1);
            writeheader(gfc, gi.block_type, 2);
            writeheader(gfc, gi.mixed_block_flag, 1);
            if (gi.table_select[0] == 14)
              gi.table_select[0] = 16;
            writeheader(gfc, gi.table_select[0], 5);
            if (gi.table_select[1] == 14)
              gi.table_select[1] = 16;
            writeheader(gfc, gi.table_select[1], 5);
            writeheader(gfc, gi.subblock_gain[0], 3);
            writeheader(gfc, gi.subblock_gain[1], 3);
            writeheader(gfc, gi.subblock_gain[2], 3);
          } else {
            writeheader(gfc, 0, 1);
            if (gi.table_select[0] == 14)
              gi.table_select[0] = 16;
            writeheader(gfc, gi.table_select[0], 5);
            if (gi.table_select[1] == 14)
              gi.table_select[1] = 16;
            writeheader(gfc, gi.table_select[1], 5);
            if (gi.table_select[2] == 14)
              gi.table_select[2] = 16;
            writeheader(gfc, gi.table_select[2], 5);
            writeheader(gfc, gi.region0_count, 4);
            writeheader(gfc, gi.region1_count, 3);
          }
          writeheader(gfc, gi.scalefac_scale, 1);
          writeheader(gfc, gi.count1table_select, 1);
        }
      }
      if (gfp.error_protection) {
        CRC_writeheader(gfc, gfc.header[gfc.h_ptr].buf);
      }
      {
        var old = gfc.h_ptr;
        gfc.h_ptr = old + 1 & LameInternalFlags.MAX_HEADER_BUF - 1;
        gfc.header[gfc.h_ptr].write_timing = gfc.header[old].write_timing + bitsPerFrame;
        if (gfc.h_ptr == gfc.w_ptr) {
          System.err.println("Error: MAX_HEADER_BUF too small in bitstream.c \n");
        }
      }
    }
    function huffman_coder_count1(gfc, gi) {
      var h = Tables.ht[gi.count1table_select + 32];
      var i, bits = 0;
      var ix = gi.big_values;
      var xr = gi.big_values;
      for (i = (gi.count1 - gi.big_values) / 4; i > 0; --i) {
        var huffbits = 0;
        var p = 0, v;
        v = gi.l3_enc[ix + 0];
        if (v != 0) {
          p += 8;
          if (gi.xr[xr + 0] < 0)
            huffbits++;
        }
        v = gi.l3_enc[ix + 1];
        if (v != 0) {
          p += 4;
          huffbits *= 2;
          if (gi.xr[xr + 1] < 0)
            huffbits++;
        }
        v = gi.l3_enc[ix + 2];
        if (v != 0) {
          p += 2;
          huffbits *= 2;
          if (gi.xr[xr + 2] < 0)
            huffbits++;
        }
        v = gi.l3_enc[ix + 3];
        if (v != 0) {
          p++;
          huffbits *= 2;
          if (gi.xr[xr + 3] < 0)
            huffbits++;
        }
        ix += 4;
        xr += 4;
        putbits2(gfc, huffbits + h.table[p], h.hlen[p]);
        bits += h.hlen[p];
      }
      return bits;
    }
    function Huffmancode(gfc, tableindex, start, end, gi) {
      var h = Tables.ht[tableindex];
      var bits = 0;
      if (0 == tableindex)
        return bits;
      for (var i = start; i < end; i += 2) {
        var cbits = 0;
        var xbits = 0;
        var linbits = h.xlen;
        var xlen = h.xlen;
        var ext = 0;
        var x1 = gi.l3_enc[i];
        var x2 = gi.l3_enc[i + 1];
        if (x1 != 0) {
          if (gi.xr[i] < 0)
            ext++;
          cbits--;
        }
        if (tableindex > 15) {
          if (x1 > 14) {
            var linbits_x1 = x1 - 15;
            ext |= linbits_x1 << 1;
            xbits = linbits;
            x1 = 15;
          }
          if (x2 > 14) {
            var linbits_x2 = x2 - 15;
            ext <<= linbits;
            ext |= linbits_x2;
            xbits += linbits;
            x2 = 15;
          }
          xlen = 16;
        }
        if (x2 != 0) {
          ext <<= 1;
          if (gi.xr[i + 1] < 0)
            ext++;
          cbits--;
        }
        x1 = x1 * xlen + x2;
        xbits -= cbits;
        cbits += h.hlen[x1];
        putbits2(gfc, h.table[x1], cbits);
        putbits2(gfc, ext, xbits);
        bits += cbits + xbits;
      }
      return bits;
    }
    function ShortHuffmancodebits(gfc, gi) {
      var region1Start = 3 * gfc.scalefac_band.s[3];
      if (region1Start > gi.big_values)
        region1Start = gi.big_values;
      var bits = Huffmancode(gfc, gi.table_select[0], 0, region1Start, gi);
      bits += Huffmancode(
        gfc,
        gi.table_select[1],
        region1Start,
        gi.big_values,
        gi
      );
      return bits;
    }
    function LongHuffmancodebits(gfc, gi) {
      var bigvalues, bits;
      var region1Start, region2Start;
      bigvalues = gi.big_values;
      var i = gi.region0_count + 1;
      region1Start = gfc.scalefac_band.l[i];
      i += gi.region1_count + 1;
      region2Start = gfc.scalefac_band.l[i];
      if (region1Start > bigvalues)
        region1Start = bigvalues;
      if (region2Start > bigvalues)
        region2Start = bigvalues;
      bits = Huffmancode(gfc, gi.table_select[0], 0, region1Start, gi);
      bits += Huffmancode(
        gfc,
        gi.table_select[1],
        region1Start,
        region2Start,
        gi
      );
      bits += Huffmancode(
        gfc,
        gi.table_select[2],
        region2Start,
        bigvalues,
        gi
      );
      return bits;
    }
    function writeMainData(gfp) {
      var gr, ch, sfb, data_bits, tot_bits = 0;
      var gfc = gfp.internal_flags;
      var l3_side = gfc.l3_side;
      if (gfp.version == 1) {
        for (gr = 0; gr < 2; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            var gi = l3_side.tt[gr][ch];
            var slen1 = Takehiro.slen1_tab[gi.scalefac_compress];
            var slen2 = Takehiro.slen2_tab[gi.scalefac_compress];
            data_bits = 0;
            for (sfb = 0; sfb < gi.sfbdivide; sfb++) {
              if (gi.scalefac[sfb] == -1)
                continue;
              putbits2(gfc, gi.scalefac[sfb], slen1);
              data_bits += slen1;
            }
            for (; sfb < gi.sfbmax; sfb++) {
              if (gi.scalefac[sfb] == -1)
                continue;
              putbits2(gfc, gi.scalefac[sfb], slen2);
              data_bits += slen2;
            }
            if (gi.block_type == Encoder.SHORT_TYPE) {
              data_bits += ShortHuffmancodebits(gfc, gi);
            } else {
              data_bits += LongHuffmancodebits(gfc, gi);
            }
            data_bits += huffman_coder_count1(gfc, gi);
            tot_bits += data_bits;
          }
        }
      } else {
        gr = 0;
        for (ch = 0; ch < gfc.channels_out; ch++) {
          var gi = l3_side.tt[gr][ch];
          var i, sfb_partition, scale_bits = 0;
          data_bits = 0;
          sfb = 0;
          sfb_partition = 0;
          if (gi.block_type == Encoder.SHORT_TYPE) {
            for (; sfb_partition < 4; sfb_partition++) {
              var sfbs = gi.sfb_partition_table[sfb_partition] / 3;
              var slen = gi.slen[sfb_partition];
              for (i = 0; i < sfbs; i++, sfb++) {
                putbits2(
                  gfc,
                  Math.max(gi.scalefac[sfb * 3 + 0], 0),
                  slen
                );
                putbits2(
                  gfc,
                  Math.max(gi.scalefac[sfb * 3 + 1], 0),
                  slen
                );
                putbits2(
                  gfc,
                  Math.max(gi.scalefac[sfb * 3 + 2], 0),
                  slen
                );
                scale_bits += 3 * slen;
              }
            }
            data_bits += ShortHuffmancodebits(gfc, gi);
          } else {
            for (; sfb_partition < 4; sfb_partition++) {
              var sfbs = gi.sfb_partition_table[sfb_partition];
              var slen = gi.slen[sfb_partition];
              for (i = 0; i < sfbs; i++, sfb++) {
                putbits2(gfc, Math.max(gi.scalefac[sfb], 0), slen);
                scale_bits += slen;
              }
            }
            data_bits += LongHuffmancodebits(gfc, gi);
          }
          data_bits += huffman_coder_count1(gfc, gi);
          tot_bits += scale_bits + data_bits;
        }
      }
      return tot_bits;
    }
    function TotalBytes() {
      this.total = 0;
    }
    function compute_flushbits(gfp, total_bytes_output) {
      var gfc = gfp.internal_flags;
      var flushbits, remaining_headers;
      var bitsPerFrame;
      var last_ptr, first_ptr;
      first_ptr = gfc.w_ptr;
      last_ptr = gfc.h_ptr - 1;
      if (last_ptr == -1)
        last_ptr = LameInternalFlags.MAX_HEADER_BUF - 1;
      flushbits = gfc.header[last_ptr].write_timing - totbit;
      total_bytes_output.total = flushbits;
      if (flushbits >= 0) {
        remaining_headers = 1 + last_ptr - first_ptr;
        if (last_ptr < first_ptr)
          remaining_headers = 1 + last_ptr - first_ptr + LameInternalFlags.MAX_HEADER_BUF;
        flushbits -= remaining_headers * 8 * gfc.sideinfo_len;
      }
      bitsPerFrame = self.getframebits(gfp);
      flushbits += bitsPerFrame;
      total_bytes_output.total += bitsPerFrame;
      if (total_bytes_output.total % 8 != 0)
        total_bytes_output.total = 1 + total_bytes_output.total / 8;
      else
        total_bytes_output.total = total_bytes_output.total / 8;
      total_bytes_output.total += bufByteIdx + 1;
      if (flushbits < 0) {
        System.err.println("strange error flushing buffer ... \n");
      }
      return flushbits;
    }
    this.flush_bitstream = function(gfp) {
      var gfc = gfp.internal_flags;
      var l3_side;
      var flushbits;
      var last_ptr = gfc.h_ptr - 1;
      if (last_ptr == -1)
        last_ptr = LameInternalFlags.MAX_HEADER_BUF - 1;
      l3_side = gfc.l3_side;
      if ((flushbits = compute_flushbits(gfp, new TotalBytes())) < 0)
        return;
      drain_into_ancillary(gfp, flushbits);
      gfc.ResvSize = 0;
      l3_side.main_data_begin = 0;
      if (gfc.findReplayGain) {
        var RadioGain = ga.GetTitleGain(gfc.rgdata);
        gfc.RadioGain = Math.floor(RadioGain * 10 + 0.5) | 0;
      }
      if (gfc.findPeakSample) {
        gfc.noclipGainChange = Math.ceil(Math.log10(gfc.PeakSample / 32767) * 20 * 10) | 0;
        if (gfc.noclipGainChange > 0) {
          if (EQ(gfp.scale, 1) || EQ(gfp.scale, 0))
            gfc.noclipScale = Math.floor(32767 / gfc.PeakSample * 100) / 100;
          else {
            gfc.noclipScale = -1;
          }
        } else
          gfc.noclipScale = -1;
      }
    };
    this.add_dummy_byte = function(gfp, val, n) {
      var gfc = gfp.internal_flags;
      var i;
      while (n-- > 0) {
        putbits_noheaders(gfc, val, 8);
        for (i = 0; i < LameInternalFlags.MAX_HEADER_BUF; ++i)
          gfc.header[i].write_timing += 8;
      }
    };
    this.format_bitstream = function(gfp) {
      var gfc = gfp.internal_flags;
      var l3_side;
      l3_side = gfc.l3_side;
      var bitsPerFrame = this.getframebits(gfp);
      drain_into_ancillary(gfp, l3_side.resvDrain_pre);
      encodeSideInfo2(gfp, bitsPerFrame);
      var bits = 8 * gfc.sideinfo_len;
      bits += writeMainData(gfp);
      drain_into_ancillary(gfp, l3_side.resvDrain_post);
      bits += l3_side.resvDrain_post;
      l3_side.main_data_begin += (bitsPerFrame - bits) / 8;
      if (compute_flushbits(gfp, new TotalBytes()) != gfc.ResvSize) {
        System.err.println("Internal buffer inconsistency. flushbits <> ResvSize");
      }
      if (l3_side.main_data_begin * 8 != gfc.ResvSize) {
        System.err.printf(
          "bit reservoir error: \nl3_side.main_data_begin: %d \nResvoir size:             %d \nresv drain (post)         %d \nresv drain (pre)          %d \nheader and sideinfo:      %d \ndata bits:                %d \ntotal bits:               %d (remainder: %d) \nbitsperframe:             %d \n",
          8 * l3_side.main_data_begin,
          gfc.ResvSize,
          l3_side.resvDrain_post,
          l3_side.resvDrain_pre,
          8 * gfc.sideinfo_len,
          bits - l3_side.resvDrain_post - 8 * gfc.sideinfo_len,
          bits,
          bits % 8,
          bitsPerFrame
        );
        System.err.println("This is a fatal error.  It has several possible causes:");
        System.err.println("90%%  LAME compiled with buggy version of gcc using advanced optimizations");
        System.err.println(" 9%%  Your system is overclocked");
        System.err.println(" 1%%  bug in LAME encoding library");
        gfc.ResvSize = l3_side.main_data_begin * 8;
      }
      if (totbit > 1e9) {
        var i;
        for (i = 0; i < LameInternalFlags.MAX_HEADER_BUF; ++i)
          gfc.header[i].write_timing -= totbit;
        totbit = 0;
      }
      return 0;
    };
    this.copy_buffer = function(gfc, buffer, bufferPos, size, mp3data) {
      var minimum = bufByteIdx + 1;
      if (minimum <= 0)
        return 0;
      if (size != 0 && minimum > size) {
        return -1;
      }
      System.arraycopy(buf, 0, buffer, bufferPos, minimum);
      bufByteIdx = -1;
      bufBitIdx = 0;
      if (mp3data != 0) {
        var crc = new_int(1);
        crc[0] = gfc.nMusicCRC;
        vbr.updateMusicCRC(crc, buffer, bufferPos, minimum);
        gfc.nMusicCRC = crc[0];
        if (minimum > 0) {
          gfc.VBR_seek_table.nBytesWritten += minimum;
        }
        if (gfc.decode_on_the_fly) {
          var pcm_buf = new_float_n([2, 1152]);
          var mp3_in = minimum;
          var samples_out = -1;
          var i;
          while (samples_out != 0) {
            samples_out = mpg.hip_decode1_unclipped(
              gfc.hip,
              buffer,
              bufferPos,
              mp3_in,
              pcm_buf[0],
              pcm_buf[1]
            );
            mp3_in = 0;
            if (samples_out == -1) {
              samples_out = 0;
            }
            if (samples_out > 0) {
              if (gfc.findPeakSample) {
                for (i = 0; i < samples_out; i++) {
                  if (pcm_buf[0][i] > gfc.PeakSample)
                    gfc.PeakSample = pcm_buf[0][i];
                  else if (-pcm_buf[0][i] > gfc.PeakSample)
                    gfc.PeakSample = -pcm_buf[0][i];
                }
                if (gfc.channels_out > 1)
                  for (i = 0; i < samples_out; i++) {
                    if (pcm_buf[1][i] > gfc.PeakSample)
                      gfc.PeakSample = pcm_buf[1][i];
                    else if (-pcm_buf[1][i] > gfc.PeakSample)
                      gfc.PeakSample = -pcm_buf[1][i];
                  }
              }
              if (gfc.findReplayGain) {
                if (ga.AnalyzeSamples(
                  gfc.rgdata,
                  pcm_buf[0],
                  0,
                  pcm_buf[1],
                  0,
                  samples_out,
                  gfc.channels_out
                ) == GainAnalysis.GAIN_ANALYSIS_ERROR)
                  return -6;
              }
            }
          }
        }
      }
      return minimum;
    };
    this.init_bit_stream_w = function(gfc) {
      buf = new_byte(Lame.LAME_MAXMP3BUFFER);
      gfc.h_ptr = gfc.w_ptr = 0;
      gfc.header[gfc.h_ptr].write_timing = 0;
      bufByteIdx = -1;
      bufBitIdx = 0;
      totbit = 0;
    };
  }
  VBRTag.NUMTOCENTRIES = 100;
  VBRTag.MAXFRAMESIZE = 2880;
  function VBRTag() {
    var lame;
    var bs;
    var v;
    this.setModules = function(_lame, _bs, _v) {
      lame = _lame;
      bs = _bs;
      v = _v;
    };
    var FRAMES_FLAG = 1;
    var BYTES_FLAG = 2;
    var TOC_FLAG = 4;
    var VBR_SCALE_FLAG = 8;
    var NUMTOCENTRIES = VBRTag.NUMTOCENTRIES;
    var MAXFRAMESIZE = VBRTag.MAXFRAMESIZE;
    var VBRHEADERSIZE = NUMTOCENTRIES + 4 + 4 + 4 + 4 + 4;
    var LAMEHEADERSIZE = VBRHEADERSIZE + 9 + 1 + 1 + 8 + 1 + 1 + 3 + 1 + 1 + 2 + 4 + 2 + 2;
    var XING_BITRATE1 = 128;
    var XING_BITRATE2 = 64;
    var XING_BITRATE25 = 32;
    var ISO_8859_1 = null;
    var VBRTag0 = "Xing";
    var VBRTag1 = "Info";
    var crc16Lookup = [
      0,
      49345,
      49537,
      320,
      49921,
      960,
      640,
      49729,
      50689,
      1728,
      1920,
      51009,
      1280,
      50625,
      50305,
      1088,
      52225,
      3264,
      3456,
      52545,
      3840,
      53185,
      52865,
      3648,
      2560,
      51905,
      52097,
      2880,
      51457,
      2496,
      2176,
      51265,
      55297,
      6336,
      6528,
      55617,
      6912,
      56257,
      55937,
      6720,
      7680,
      57025,
      57217,
      8e3,
      56577,
      7616,
      7296,
      56385,
      5120,
      54465,
      54657,
      5440,
      55041,
      6080,
      5760,
      54849,
      53761,
      4800,
      4992,
      54081,
      4352,
      53697,
      53377,
      4160,
      61441,
      12480,
      12672,
      61761,
      13056,
      62401,
      62081,
      12864,
      13824,
      63169,
      63361,
      14144,
      62721,
      13760,
      13440,
      62529,
      15360,
      64705,
      64897,
      15680,
      65281,
      16320,
      16e3,
      65089,
      64001,
      15040,
      15232,
      64321,
      14592,
      63937,
      63617,
      14400,
      10240,
      59585,
      59777,
      10560,
      60161,
      11200,
      10880,
      59969,
      60929,
      11968,
      12160,
      61249,
      11520,
      60865,
      60545,
      11328,
      58369,
      9408,
      9600,
      58689,
      9984,
      59329,
      59009,
      9792,
      8704,
      58049,
      58241,
      9024,
      57601,
      8640,
      8320,
      57409,
      40961,
      24768,
      24960,
      41281,
      25344,
      41921,
      41601,
      25152,
      26112,
      42689,
      42881,
      26432,
      42241,
      26048,
      25728,
      42049,
      27648,
      44225,
      44417,
      27968,
      44801,
      28608,
      28288,
      44609,
      43521,
      27328,
      27520,
      43841,
      26880,
      43457,
      43137,
      26688,
      30720,
      47297,
      47489,
      31040,
      47873,
      31680,
      31360,
      47681,
      48641,
      32448,
      32640,
      48961,
      32e3,
      48577,
      48257,
      31808,
      46081,
      29888,
      30080,
      46401,
      30464,
      47041,
      46721,
      30272,
      29184,
      45761,
      45953,
      29504,
      45313,
      29120,
      28800,
      45121,
      20480,
      37057,
      37249,
      20800,
      37633,
      21440,
      21120,
      37441,
      38401,
      22208,
      22400,
      38721,
      21760,
      38337,
      38017,
      21568,
      39937,
      23744,
      23936,
      40257,
      24320,
      40897,
      40577,
      24128,
      23040,
      39617,
      39809,
      23360,
      39169,
      22976,
      22656,
      38977,
      34817,
      18624,
      18816,
      35137,
      19200,
      35777,
      35457,
      19008,
      19968,
      36545,
      36737,
      20288,
      36097,
      19904,
      19584,
      35905,
      17408,
      33985,
      34177,
      17728,
      34561,
      18368,
      18048,
      34369,
      33281,
      17088,
      17280,
      33601,
      16640,
      33217,
      32897,
      16448
    ];
    function addVbr(v2, bitrate) {
      v2.nVbrNumFrames++;
      v2.sum += bitrate;
      v2.seen++;
      if (v2.seen < v2.want) {
        return;
      }
      if (v2.pos < v2.size) {
        v2.bag[v2.pos] = v2.sum;
        v2.pos++;
        v2.seen = 0;
      }
      if (v2.pos == v2.size) {
        for (var i = 1; i < v2.size; i += 2) {
          v2.bag[i / 2] = v2.bag[i];
        }
        v2.want *= 2;
        v2.pos /= 2;
      }
    }
    function xingSeekTable(v2, t) {
      if (v2.pos <= 0)
        return;
      for (var i = 1; i < NUMTOCENTRIES; ++i) {
        var j = i / NUMTOCENTRIES, act, sum;
        var indx = 0 | Math.floor(j * v2.pos);
        if (indx > v2.pos - 1)
          indx = v2.pos - 1;
        act = v2.bag[indx];
        sum = v2.sum;
        var seek_point = 0 | 256 * act / sum;
        if (seek_point > 255)
          seek_point = 255;
        t[i] = 255 & seek_point;
      }
    }
    this.addVbrFrame = function(gfp) {
      var gfc = gfp.internal_flags;
      var kbps = Tables.bitrate_table[gfp.version][gfc.bitrate_index];
      addVbr(gfc.VBR_seek_table, kbps);
    };
    function extractInteger(buf, bufPos) {
      var x = buf[bufPos + 0] & 255;
      x <<= 8;
      x |= buf[bufPos + 1] & 255;
      x <<= 8;
      x |= buf[bufPos + 2] & 255;
      x <<= 8;
      x |= buf[bufPos + 3] & 255;
      return x;
    }
    function createInteger(buf, bufPos, value) {
      buf[bufPos + 0] = 255 & (value >> 24 & 255);
      buf[bufPos + 1] = 255 & (value >> 16 & 255);
      buf[bufPos + 2] = 255 & (value >> 8 & 255);
      buf[bufPos + 3] = 255 & (value & 255);
    }
    function createShort(buf, bufPos, value) {
      buf[bufPos + 0] = 255 & (value >> 8 & 255);
      buf[bufPos + 1] = 255 & (value & 255);
    }
    function isVbrTag(buf, bufPos) {
      return new String(buf, bufPos, VBRTag0.length(), ISO_8859_1).equals(VBRTag0) || new String(buf, bufPos, VBRTag1.length(), ISO_8859_1).equals(VBRTag1);
    }
    function shiftInBitsValue(x, n, v2) {
      return 255 & (x << n | v2 & ~(-1 << n));
    }
    function setLameTagFrameHeader(gfp, buffer) {
      var gfc = gfp.internal_flags;
      buffer[0] = shiftInBitsValue(buffer[0], 8, 255);
      buffer[1] = shiftInBitsValue(buffer[1], 3, 7);
      buffer[1] = shiftInBitsValue(
        buffer[1],
        1,
        gfp.out_samplerate < 16e3 ? 0 : 1
      );
      buffer[1] = shiftInBitsValue(buffer[1], 1, gfp.version);
      buffer[1] = shiftInBitsValue(buffer[1], 2, 4 - 3);
      buffer[1] = shiftInBitsValue(buffer[1], 1, !gfp.error_protection ? 1 : 0);
      buffer[2] = shiftInBitsValue(buffer[2], 4, gfc.bitrate_index);
      buffer[2] = shiftInBitsValue(buffer[2], 2, gfc.samplerate_index);
      buffer[2] = shiftInBitsValue(buffer[2], 1, 0);
      buffer[2] = shiftInBitsValue(buffer[2], 1, gfp.extension);
      buffer[3] = shiftInBitsValue(buffer[3], 2, gfp.mode.ordinal());
      buffer[3] = shiftInBitsValue(buffer[3], 2, gfc.mode_ext);
      buffer[3] = shiftInBitsValue(buffer[3], 1, gfp.copyright);
      buffer[3] = shiftInBitsValue(buffer[3], 1, gfp.original);
      buffer[3] = shiftInBitsValue(buffer[3], 2, gfp.emphasis);
      buffer[0] = 255;
      var abyte = 255 & (buffer[1] & 241);
      var bitrate;
      if (1 == gfp.version) {
        bitrate = XING_BITRATE1;
      } else {
        if (gfp.out_samplerate < 16e3)
          bitrate = XING_BITRATE25;
        else
          bitrate = XING_BITRATE2;
      }
      if (gfp.VBR == VbrMode.vbr_off)
        bitrate = gfp.brate;
      var bbyte;
      if (gfp.free_format)
        bbyte = 0;
      else
        bbyte = 255 & 16 * lame.BitrateIndex(
          bitrate,
          gfp.version,
          gfp.out_samplerate
        );
      if (gfp.version == 1) {
        buffer[1] = 255 & (abyte | 10);
        abyte = 255 & (buffer[2] & 13);
        buffer[2] = 255 & (bbyte | abyte);
      } else {
        buffer[1] = 255 & (abyte | 2);
        abyte = 255 & (buffer[2] & 13);
        buffer[2] = 255 & (bbyte | abyte);
      }
    }
    this.getVbrTag = function(buf) {
      var pTagData = new VBRTagData();
      var bufPos = 0;
      pTagData.flags = 0;
      var hId = buf[bufPos + 1] >> 3 & 1;
      var hSrIndex = buf[bufPos + 2] >> 2 & 3;
      var hMode = buf[bufPos + 3] >> 6 & 3;
      var hBitrate = buf[bufPos + 2] >> 4 & 15;
      hBitrate = Tables.bitrate_table[hId][hBitrate];
      if (buf[bufPos + 1] >> 4 == 14)
        pTagData.samprate = Tables.samplerate_table[2][hSrIndex];
      else
        pTagData.samprate = Tables.samplerate_table[hId][hSrIndex];
      if (hId != 0) {
        if (hMode != 3)
          bufPos += 32 + 4;
        else
          bufPos += 17 + 4;
      } else {
        if (hMode != 3)
          bufPos += 17 + 4;
        else
          bufPos += 9 + 4;
      }
      if (!isVbrTag(buf, bufPos))
        return null;
      bufPos += 4;
      pTagData.hId = hId;
      var head_flags = pTagData.flags = extractInteger(buf, bufPos);
      bufPos += 4;
      if ((head_flags & FRAMES_FLAG) != 0) {
        pTagData.frames = extractInteger(buf, bufPos);
        bufPos += 4;
      }
      if ((head_flags & BYTES_FLAG) != 0) {
        pTagData.bytes = extractInteger(buf, bufPos);
        bufPos += 4;
      }
      if ((head_flags & TOC_FLAG) != 0) {
        if (pTagData.toc != null) {
          for (var i = 0; i < NUMTOCENTRIES; i++)
            pTagData.toc[i] = buf[bufPos + i];
        }
        bufPos += NUMTOCENTRIES;
      }
      pTagData.vbrScale = -1;
      if ((head_flags & VBR_SCALE_FLAG) != 0) {
        pTagData.vbrScale = extractInteger(buf, bufPos);
        bufPos += 4;
      }
      pTagData.headersize = (hId + 1) * 72e3 * hBitrate / pTagData.samprate;
      bufPos += 21;
      var encDelay = buf[bufPos + 0] << 4;
      encDelay += buf[bufPos + 1] >> 4;
      var encPadding = (buf[bufPos + 1] & 15) << 8;
      encPadding += buf[bufPos + 2] & 255;
      if (encDelay < 0 || encDelay > 3e3)
        encDelay = -1;
      if (encPadding < 0 || encPadding > 3e3)
        encPadding = -1;
      pTagData.encDelay = encDelay;
      pTagData.encPadding = encPadding;
      return pTagData;
    };
    this.InitVbrTag = function(gfp) {
      var gfc = gfp.internal_flags;
      var kbps_header;
      if (1 == gfp.version) {
        kbps_header = XING_BITRATE1;
      } else {
        if (gfp.out_samplerate < 16e3)
          kbps_header = XING_BITRATE25;
        else
          kbps_header = XING_BITRATE2;
      }
      if (gfp.VBR == VbrMode.vbr_off)
        kbps_header = gfp.brate;
      var totalFrameSize = (gfp.version + 1) * 72e3 * kbps_header / gfp.out_samplerate;
      var headerSize = gfc.sideinfo_len + LAMEHEADERSIZE;
      gfc.VBR_seek_table.TotalFrameSize = totalFrameSize;
      if (totalFrameSize < headerSize || totalFrameSize > MAXFRAMESIZE) {
        gfp.bWriteVbrTag = false;
        return;
      }
      gfc.VBR_seek_table.nVbrNumFrames = 0;
      gfc.VBR_seek_table.nBytesWritten = 0;
      gfc.VBR_seek_table.sum = 0;
      gfc.VBR_seek_table.seen = 0;
      gfc.VBR_seek_table.want = 1;
      gfc.VBR_seek_table.pos = 0;
      if (gfc.VBR_seek_table.bag == null) {
        gfc.VBR_seek_table.bag = new int[400]();
        gfc.VBR_seek_table.size = 400;
      }
      var buffer = new_byte(MAXFRAMESIZE);
      setLameTagFrameHeader(gfp, buffer);
      var n = gfc.VBR_seek_table.TotalFrameSize;
      for (var i = 0; i < n; ++i) {
        bs.add_dummy_byte(gfp, buffer[i] & 255, 1);
      }
    };
    function crcUpdateLookup(value, crc) {
      var tmp = crc ^ value;
      crc = crc >> 8 ^ crc16Lookup[tmp & 255];
      return crc;
    }
    this.updateMusicCRC = function(crc, buffer, bufferPos, size) {
      for (var i = 0; i < size; ++i)
        crc[0] = crcUpdateLookup(buffer[bufferPos + i], crc[0]);
    };
    function putLameVBR(gfp, musicLength, streamBuffer, streamBufferPos, crc) {
      var gfc = gfp.internal_flags;
      var bytesWritten = 0;
      var encDelay = gfp.encoder_delay;
      var encPadding = gfp.encoder_padding;
      var quality = 100 - 10 * gfp.VBR_q - gfp.quality;
      var version = v.getLameVeryShortVersion();
      var vbr;
      var revision = 0;
      var revMethod;
      var vbrTypeTranslator = [1, 5, 3, 2, 4, 0, 3];
      var lowpass = 0 | (gfp.lowpassfreq / 100 + 0.5 > 255 ? 255 : gfp.lowpassfreq / 100 + 0.5);
      var peakSignalAmplitude = 0;
      var radioReplayGain = 0;
      var audiophileReplayGain = 0;
      var noiseShaping = gfp.internal_flags.noise_shaping;
      var stereoMode = 0;
      var nonOptimal = 0;
      var sourceFreq = 0;
      var misc = 0;
      var musicCRC = 0;
      var expNPsyTune = (gfp.exp_nspsytune & 1) != 0;
      var safeJoint = (gfp.exp_nspsytune & 2) != 0;
      var noGapMore = false;
      var noGapPrevious = false;
      var noGapCount = gfp.internal_flags.nogap_total;
      var noGapCurr = gfp.internal_flags.nogap_current;
      var athType = gfp.ATHtype;
      var flags = 0;
      var abrBitrate;
      switch (gfp.VBR) {
        case vbr_abr:
          abrBitrate = gfp.VBR_mean_bitrate_kbps;
          break;
        case vbr_off:
          abrBitrate = gfp.brate;
          break;
        default:
          abrBitrate = gfp.VBR_min_bitrate_kbps;
      }
      if (gfp.VBR.ordinal() < vbrTypeTranslator.length)
        vbr = vbrTypeTranslator[gfp.VBR.ordinal()];
      else
        vbr = 0;
      revMethod = 16 * revision + vbr;
      if (gfc.findReplayGain) {
        if (gfc.RadioGain > 510)
          gfc.RadioGain = 510;
        if (gfc.RadioGain < -510)
          gfc.RadioGain = -510;
        radioReplayGain = 8192;
        radioReplayGain |= 3072;
        if (gfc.RadioGain >= 0) {
          radioReplayGain |= gfc.RadioGain;
        } else {
          radioReplayGain |= 512;
          radioReplayGain |= -gfc.RadioGain;
        }
      }
      if (gfc.findPeakSample)
        peakSignalAmplitude = Math.abs(0 | gfc.PeakSample / 32767 * Math.pow(2, 23) + 0.5);
      if (noGapCount != -1) {
        if (noGapCurr > 0)
          noGapPrevious = true;
        if (noGapCurr < noGapCount - 1)
          noGapMore = true;
      }
      flags = athType + ((expNPsyTune ? 1 : 0) << 4) + ((safeJoint ? 1 : 0) << 5) + ((noGapMore ? 1 : 0) << 6) + ((noGapPrevious ? 1 : 0) << 7);
      if (quality < 0)
        quality = 0;
      switch (gfp.mode) {
        case MONO:
          stereoMode = 0;
          break;
        case STEREO:
          stereoMode = 1;
          break;
        case DUAL_CHANNEL:
          stereoMode = 2;
          break;
        case JOINT_STEREO:
          if (gfp.force_ms)
            stereoMode = 4;
          else
            stereoMode = 3;
          break;
        case NOT_SET:
        //$FALL-THROUGH$
        default:
          stereoMode = 7;
          break;
      }
      if (gfp.in_samplerate <= 32e3)
        sourceFreq = 0;
      else if (gfp.in_samplerate == 48e3)
        sourceFreq = 2;
      else if (gfp.in_samplerate > 48e3)
        sourceFreq = 3;
      else {
        sourceFreq = 1;
      }
      if (gfp.short_blocks == ShortBlock.short_block_forced || gfp.short_blocks == ShortBlock.short_block_dispensed || gfp.lowpassfreq == -1 && gfp.highpassfreq == -1 || /* "-k" */
      gfp.scale_left < gfp.scale_right || gfp.scale_left > gfp.scale_right || gfp.disable_reservoir && gfp.brate < 320 || gfp.noATH || gfp.ATHonly || athType == 0 || gfp.in_samplerate <= 32e3)
        nonOptimal = 1;
      misc = noiseShaping + (stereoMode << 2) + (nonOptimal << 5) + (sourceFreq << 6);
      musicCRC = gfc.nMusicCRC;
      createInteger(streamBuffer, streamBufferPos + bytesWritten, quality);
      bytesWritten += 4;
      for (var j = 0; j < 9; j++) {
        streamBuffer[streamBufferPos + bytesWritten + j] = 255 & version.charAt(j);
      }
      bytesWritten += 9;
      streamBuffer[streamBufferPos + bytesWritten] = 255 & revMethod;
      bytesWritten++;
      streamBuffer[streamBufferPos + bytesWritten] = 255 & lowpass;
      bytesWritten++;
      createInteger(
        streamBuffer,
        streamBufferPos + bytesWritten,
        peakSignalAmplitude
      );
      bytesWritten += 4;
      createShort(
        streamBuffer,
        streamBufferPos + bytesWritten,
        radioReplayGain
      );
      bytesWritten += 2;
      createShort(
        streamBuffer,
        streamBufferPos + bytesWritten,
        audiophileReplayGain
      );
      bytesWritten += 2;
      streamBuffer[streamBufferPos + bytesWritten] = 255 & flags;
      bytesWritten++;
      if (abrBitrate >= 255)
        streamBuffer[streamBufferPos + bytesWritten] = 255;
      else
        streamBuffer[streamBufferPos + bytesWritten] = 255 & abrBitrate;
      bytesWritten++;
      streamBuffer[streamBufferPos + bytesWritten] = 255 & encDelay >> 4;
      streamBuffer[streamBufferPos + bytesWritten + 1] = 255 & (encDelay << 4) + (encPadding >> 8);
      streamBuffer[streamBufferPos + bytesWritten + 2] = 255 & encPadding;
      bytesWritten += 3;
      streamBuffer[streamBufferPos + bytesWritten] = 255 & misc;
      bytesWritten++;
      streamBuffer[streamBufferPos + bytesWritten++] = 0;
      createShort(streamBuffer, streamBufferPos + bytesWritten, gfp.preset);
      bytesWritten += 2;
      createInteger(streamBuffer, streamBufferPos + bytesWritten, musicLength);
      bytesWritten += 4;
      createShort(streamBuffer, streamBufferPos + bytesWritten, musicCRC);
      bytesWritten += 2;
      for (var i = 0; i < bytesWritten; i++)
        crc = crcUpdateLookup(streamBuffer[streamBufferPos + i], crc);
      createShort(streamBuffer, streamBufferPos + bytesWritten, crc);
      bytesWritten += 2;
      return bytesWritten;
    }
    function skipId3v2(fpStream) {
      fpStream.seek(0);
      var id3v2Header = new_byte(10);
      fpStream.readFully(id3v2Header);
      var id3v2TagSize;
      if (!new String(id3v2Header, "ISO-8859-1").startsWith("ID3")) {
        id3v2TagSize = ((id3v2Header[6] & 127) << 21 | (id3v2Header[7] & 127) << 14 | (id3v2Header[8] & 127) << 7 | id3v2Header[9] & 127) + id3v2Header.length;
      } else {
        id3v2TagSize = 0;
      }
      return id3v2TagSize;
    }
    this.getLameTagFrame = function(gfp, buffer) {
      var gfc = gfp.internal_flags;
      if (!gfp.bWriteVbrTag) {
        return 0;
      }
      if (gfc.Class_ID != Lame.LAME_ID) {
        return 0;
      }
      if (gfc.VBR_seek_table.pos <= 0) {
        return 0;
      }
      if (buffer.length < gfc.VBR_seek_table.TotalFrameSize) {
        return gfc.VBR_seek_table.TotalFrameSize;
      }
      Arrays.fill(buffer, 0, gfc.VBR_seek_table.TotalFrameSize, 0);
      setLameTagFrameHeader(gfp, buffer);
      var toc = new_byte(NUMTOCENTRIES);
      if (gfp.free_format) {
        for (var i = 1; i < NUMTOCENTRIES; ++i)
          toc[i] = 255 & 255 * i / 100;
      } else {
        xingSeekTable(gfc.VBR_seek_table, toc);
      }
      var streamIndex = gfc.sideinfo_len;
      if (gfp.error_protection)
        streamIndex -= 2;
      if (gfp.VBR == VbrMode.vbr_off) {
        buffer[streamIndex++] = 255 & VBRTag1.charAt(0);
        buffer[streamIndex++] = 255 & VBRTag1.charAt(1);
        buffer[streamIndex++] = 255 & VBRTag1.charAt(2);
        buffer[streamIndex++] = 255 & VBRTag1.charAt(3);
      } else {
        buffer[streamIndex++] = 255 & VBRTag0.charAt(0);
        buffer[streamIndex++] = 255 & VBRTag0.charAt(1);
        buffer[streamIndex++] = 255 & VBRTag0.charAt(2);
        buffer[streamIndex++] = 255 & VBRTag0.charAt(3);
      }
      createInteger(buffer, streamIndex, FRAMES_FLAG + BYTES_FLAG + TOC_FLAG + VBR_SCALE_FLAG);
      streamIndex += 4;
      createInteger(buffer, streamIndex, gfc.VBR_seek_table.nVbrNumFrames);
      streamIndex += 4;
      var streamSize = gfc.VBR_seek_table.nBytesWritten + gfc.VBR_seek_table.TotalFrameSize;
      createInteger(buffer, streamIndex, 0 | streamSize);
      streamIndex += 4;
      System.arraycopy(toc, 0, buffer, streamIndex, toc.length);
      streamIndex += toc.length;
      if (gfp.error_protection) {
        bs.CRC_writeheader(gfc, buffer);
      }
      var crc = 0;
      for (var i = 0; i < streamIndex; i++)
        crc = crcUpdateLookup(buffer[i], crc);
      streamIndex += putLameVBR(gfp, streamSize, buffer, streamIndex, crc);
      return gfc.VBR_seek_table.TotalFrameSize;
    };
    this.putVbrTag = function(gfp, stream) {
      var gfc = gfp.internal_flags;
      if (gfc.VBR_seek_table.pos <= 0)
        return -1;
      stream.seek(stream.length());
      if (stream.length() == 0)
        return -1;
      var id3v2TagSize = skipId3v2(stream);
      stream.seek(id3v2TagSize);
      var buffer = new_byte(MAXFRAMESIZE);
      var bytes = getLameTagFrame(gfp, buffer);
      if (bytes > buffer.length) {
        return -1;
      }
      if (bytes < 1) {
        return 0;
      }
      stream.write(buffer, 0, bytes);
      return 0;
    };
  }
  function HuffCodeTab(len, max, tab, hl) {
    this.xlen = len;
    this.linmax = max;
    this.table = tab;
    this.hlen = hl;
  }
  var Tables = {};
  Tables.t1HB = [
    1,
    1,
    1,
    0
  ];
  Tables.t2HB = [
    1,
    2,
    1,
    3,
    1,
    1,
    3,
    2,
    0
  ];
  Tables.t3HB = [
    3,
    2,
    1,
    1,
    1,
    1,
    3,
    2,
    0
  ];
  Tables.t5HB = [
    1,
    2,
    6,
    5,
    3,
    1,
    4,
    4,
    7,
    5,
    7,
    1,
    6,
    1,
    1,
    0
  ];
  Tables.t6HB = [
    7,
    3,
    5,
    1,
    6,
    2,
    3,
    2,
    5,
    4,
    4,
    1,
    3,
    3,
    2,
    0
  ];
  Tables.t7HB = [
    1,
    2,
    10,
    19,
    16,
    10,
    3,
    3,
    7,
    10,
    5,
    3,
    11,
    4,
    13,
    17,
    8,
    4,
    12,
    11,
    18,
    15,
    11,
    2,
    7,
    6,
    9,
    14,
    3,
    1,
    6,
    4,
    5,
    3,
    2,
    0
  ];
  Tables.t8HB = [
    3,
    4,
    6,
    18,
    12,
    5,
    5,
    1,
    2,
    16,
    9,
    3,
    7,
    3,
    5,
    14,
    7,
    3,
    19,
    17,
    15,
    13,
    10,
    4,
    13,
    5,
    8,
    11,
    5,
    1,
    12,
    4,
    4,
    1,
    1,
    0
  ];
  Tables.t9HB = [
    7,
    5,
    9,
    14,
    15,
    7,
    6,
    4,
    5,
    5,
    6,
    7,
    7,
    6,
    8,
    8,
    8,
    5,
    15,
    6,
    9,
    10,
    5,
    1,
    11,
    7,
    9,
    6,
    4,
    1,
    14,
    4,
    6,
    2,
    6,
    0
  ];
  Tables.t10HB = [
    1,
    2,
    10,
    23,
    35,
    30,
    12,
    17,
    3,
    3,
    8,
    12,
    18,
    21,
    12,
    7,
    11,
    9,
    15,
    21,
    32,
    40,
    19,
    6,
    14,
    13,
    22,
    34,
    46,
    23,
    18,
    7,
    20,
    19,
    33,
    47,
    27,
    22,
    9,
    3,
    31,
    22,
    41,
    26,
    21,
    20,
    5,
    3,
    14,
    13,
    10,
    11,
    16,
    6,
    5,
    1,
    9,
    8,
    7,
    8,
    4,
    4,
    2,
    0
  ];
  Tables.t11HB = [
    3,
    4,
    10,
    24,
    34,
    33,
    21,
    15,
    5,
    3,
    4,
    10,
    32,
    17,
    11,
    10,
    11,
    7,
    13,
    18,
    30,
    31,
    20,
    5,
    25,
    11,
    19,
    59,
    27,
    18,
    12,
    5,
    35,
    33,
    31,
    58,
    30,
    16,
    7,
    5,
    28,
    26,
    32,
    19,
    17,
    15,
    8,
    14,
    14,
    12,
    9,
    13,
    14,
    9,
    4,
    1,
    11,
    4,
    6,
    6,
    6,
    3,
    2,
    0
  ];
  Tables.t12HB = [
    9,
    6,
    16,
    33,
    41,
    39,
    38,
    26,
    7,
    5,
    6,
    9,
    23,
    16,
    26,
    11,
    17,
    7,
    11,
    14,
    21,
    30,
    10,
    7,
    17,
    10,
    15,
    12,
    18,
    28,
    14,
    5,
    32,
    13,
    22,
    19,
    18,
    16,
    9,
    5,
    40,
    17,
    31,
    29,
    17,
    13,
    4,
    2,
    27,
    12,
    11,
    15,
    10,
    7,
    4,
    1,
    27,
    12,
    8,
    12,
    6,
    3,
    1,
    0
  ];
  Tables.t13HB = [
    1,
    5,
    14,
    21,
    34,
    51,
    46,
    71,
    42,
    52,
    68,
    52,
    67,
    44,
    43,
    19,
    3,
    4,
    12,
    19,
    31,
    26,
    44,
    33,
    31,
    24,
    32,
    24,
    31,
    35,
    22,
    14,
    15,
    13,
    23,
    36,
    59,
    49,
    77,
    65,
    29,
    40,
    30,
    40,
    27,
    33,
    42,
    16,
    22,
    20,
    37,
    61,
    56,
    79,
    73,
    64,
    43,
    76,
    56,
    37,
    26,
    31,
    25,
    14,
    35,
    16,
    60,
    57,
    97,
    75,
    114,
    91,
    54,
    73,
    55,
    41,
    48,
    53,
    23,
    24,
    58,
    27,
    50,
    96,
    76,
    70,
    93,
    84,
    77,
    58,
    79,
    29,
    74,
    49,
    41,
    17,
    47,
    45,
    78,
    74,
    115,
    94,
    90,
    79,
    69,
    83,
    71,
    50,
    59,
    38,
    36,
    15,
    72,
    34,
    56,
    95,
    92,
    85,
    91,
    90,
    86,
    73,
    77,
    65,
    51,
    44,
    43,
    42,
    43,
    20,
    30,
    44,
    55,
    78,
    72,
    87,
    78,
    61,
    46,
    54,
    37,
    30,
    20,
    16,
    53,
    25,
    41,
    37,
    44,
    59,
    54,
    81,
    66,
    76,
    57,
    54,
    37,
    18,
    39,
    11,
    35,
    33,
    31,
    57,
    42,
    82,
    72,
    80,
    47,
    58,
    55,
    21,
    22,
    26,
    38,
    22,
    53,
    25,
    23,
    38,
    70,
    60,
    51,
    36,
    55,
    26,
    34,
    23,
    27,
    14,
    9,
    7,
    34,
    32,
    28,
    39,
    49,
    75,
    30,
    52,
    48,
    40,
    52,
    28,
    18,
    17,
    9,
    5,
    45,
    21,
    34,
    64,
    56,
    50,
    49,
    45,
    31,
    19,
    12,
    15,
    10,
    7,
    6,
    3,
    48,
    23,
    20,
    39,
    36,
    35,
    53,
    21,
    16,
    23,
    13,
    10,
    6,
    1,
    4,
    2,
    16,
    15,
    17,
    27,
    25,
    20,
    29,
    11,
    17,
    12,
    16,
    8,
    1,
    1,
    0,
    1
  ];
  Tables.t15HB = [
    7,
    12,
    18,
    53,
    47,
    76,
    124,
    108,
    89,
    123,
    108,
    119,
    107,
    81,
    122,
    63,
    13,
    5,
    16,
    27,
    46,
    36,
    61,
    51,
    42,
    70,
    52,
    83,
    65,
    41,
    59,
    36,
    19,
    17,
    15,
    24,
    41,
    34,
    59,
    48,
    40,
    64,
    50,
    78,
    62,
    80,
    56,
    33,
    29,
    28,
    25,
    43,
    39,
    63,
    55,
    93,
    76,
    59,
    93,
    72,
    54,
    75,
    50,
    29,
    52,
    22,
    42,
    40,
    67,
    57,
    95,
    79,
    72,
    57,
    89,
    69,
    49,
    66,
    46,
    27,
    77,
    37,
    35,
    66,
    58,
    52,
    91,
    74,
    62,
    48,
    79,
    63,
    90,
    62,
    40,
    38,
    125,
    32,
    60,
    56,
    50,
    92,
    78,
    65,
    55,
    87,
    71,
    51,
    73,
    51,
    70,
    30,
    109,
    53,
    49,
    94,
    88,
    75,
    66,
    122,
    91,
    73,
    56,
    42,
    64,
    44,
    21,
    25,
    90,
    43,
    41,
    77,
    73,
    63,
    56,
    92,
    77,
    66,
    47,
    67,
    48,
    53,
    36,
    20,
    71,
    34,
    67,
    60,
    58,
    49,
    88,
    76,
    67,
    106,
    71,
    54,
    38,
    39,
    23,
    15,
    109,
    53,
    51,
    47,
    90,
    82,
    58,
    57,
    48,
    72,
    57,
    41,
    23,
    27,
    62,
    9,
    86,
    42,
    40,
    37,
    70,
    64,
    52,
    43,
    70,
    55,
    42,
    25,
    29,
    18,
    11,
    11,
    118,
    68,
    30,
    55,
    50,
    46,
    74,
    65,
    49,
    39,
    24,
    16,
    22,
    13,
    14,
    7,
    91,
    44,
    39,
    38,
    34,
    63,
    52,
    45,
    31,
    52,
    28,
    19,
    14,
    8,
    9,
    3,
    123,
    60,
    58,
    53,
    47,
    43,
    32,
    22,
    37,
    24,
    17,
    12,
    15,
    10,
    2,
    1,
    71,
    37,
    34,
    30,
    28,
    20,
    17,
    26,
    21,
    16,
    10,
    6,
    8,
    6,
    2,
    0
  ];
  Tables.t16HB = [
    1,
    5,
    14,
    44,
    74,
    63,
    110,
    93,
    172,
    149,
    138,
    242,
    225,
    195,
    376,
    17,
    3,
    4,
    12,
    20,
    35,
    62,
    53,
    47,
    83,
    75,
    68,
    119,
    201,
    107,
    207,
    9,
    15,
    13,
    23,
    38,
    67,
    58,
    103,
    90,
    161,
    72,
    127,
    117,
    110,
    209,
    206,
    16,
    45,
    21,
    39,
    69,
    64,
    114,
    99,
    87,
    158,
    140,
    252,
    212,
    199,
    387,
    365,
    26,
    75,
    36,
    68,
    65,
    115,
    101,
    179,
    164,
    155,
    264,
    246,
    226,
    395,
    382,
    362,
    9,
    66,
    30,
    59,
    56,
    102,
    185,
    173,
    265,
    142,
    253,
    232,
    400,
    388,
    378,
    445,
    16,
    111,
    54,
    52,
    100,
    184,
    178,
    160,
    133,
    257,
    244,
    228,
    217,
    385,
    366,
    715,
    10,
    98,
    48,
    91,
    88,
    165,
    157,
    148,
    261,
    248,
    407,
    397,
    372,
    380,
    889,
    884,
    8,
    85,
    84,
    81,
    159,
    156,
    143,
    260,
    249,
    427,
    401,
    392,
    383,
    727,
    713,
    708,
    7,
    154,
    76,
    73,
    141,
    131,
    256,
    245,
    426,
    406,
    394,
    384,
    735,
    359,
    710,
    352,
    11,
    139,
    129,
    67,
    125,
    247,
    233,
    229,
    219,
    393,
    743,
    737,
    720,
    885,
    882,
    439,
    4,
    243,
    120,
    118,
    115,
    227,
    223,
    396,
    746,
    742,
    736,
    721,
    712,
    706,
    223,
    436,
    6,
    202,
    224,
    222,
    218,
    216,
    389,
    386,
    381,
    364,
    888,
    443,
    707,
    440,
    437,
    1728,
    4,
    747,
    211,
    210,
    208,
    370,
    379,
    734,
    723,
    714,
    1735,
    883,
    877,
    876,
    3459,
    865,
    2,
    377,
    369,
    102,
    187,
    726,
    722,
    358,
    711,
    709,
    866,
    1734,
    871,
    3458,
    870,
    434,
    0,
    12,
    10,
    7,
    11,
    10,
    17,
    11,
    9,
    13,
    12,
    10,
    7,
    5,
    3,
    1,
    3
  ];
  Tables.t24HB = [
    15,
    13,
    46,
    80,
    146,
    262,
    248,
    434,
    426,
    669,
    653,
    649,
    621,
    517,
    1032,
    88,
    14,
    12,
    21,
    38,
    71,
    130,
    122,
    216,
    209,
    198,
    327,
    345,
    319,
    297,
    279,
    42,
    47,
    22,
    41,
    74,
    68,
    128,
    120,
    221,
    207,
    194,
    182,
    340,
    315,
    295,
    541,
    18,
    81,
    39,
    75,
    70,
    134,
    125,
    116,
    220,
    204,
    190,
    178,
    325,
    311,
    293,
    271,
    16,
    147,
    72,
    69,
    135,
    127,
    118,
    112,
    210,
    200,
    188,
    352,
    323,
    306,
    285,
    540,
    14,
    263,
    66,
    129,
    126,
    119,
    114,
    214,
    202,
    192,
    180,
    341,
    317,
    301,
    281,
    262,
    12,
    249,
    123,
    121,
    117,
    113,
    215,
    206,
    195,
    185,
    347,
    330,
    308,
    291,
    272,
    520,
    10,
    435,
    115,
    111,
    109,
    211,
    203,
    196,
    187,
    353,
    332,
    313,
    298,
    283,
    531,
    381,
    17,
    427,
    212,
    208,
    205,
    201,
    193,
    186,
    177,
    169,
    320,
    303,
    286,
    268,
    514,
    377,
    16,
    335,
    199,
    197,
    191,
    189,
    181,
    174,
    333,
    321,
    305,
    289,
    275,
    521,
    379,
    371,
    11,
    668,
    184,
    183,
    179,
    175,
    344,
    331,
    314,
    304,
    290,
    277,
    530,
    383,
    373,
    366,
    10,
    652,
    346,
    171,
    168,
    164,
    318,
    309,
    299,
    287,
    276,
    263,
    513,
    375,
    368,
    362,
    6,
    648,
    322,
    316,
    312,
    307,
    302,
    292,
    284,
    269,
    261,
    512,
    376,
    370,
    364,
    359,
    4,
    620,
    300,
    296,
    294,
    288,
    282,
    273,
    266,
    515,
    380,
    374,
    369,
    365,
    361,
    357,
    2,
    1033,
    280,
    278,
    274,
    267,
    264,
    259,
    382,
    378,
    372,
    367,
    363,
    360,
    358,
    356,
    0,
    43,
    20,
    19,
    17,
    15,
    13,
    11,
    9,
    7,
    6,
    4,
    7,
    5,
    3,
    1,
    3
  ];
  Tables.t32HB = [
    1 << 0,
    5 << 1,
    4 << 1,
    5 << 2,
    6 << 1,
    5 << 2,
    4 << 2,
    4 << 3,
    7 << 1,
    3 << 2,
    6 << 2,
    0 << 3,
    7 << 2,
    2 << 3,
    3 << 3,
    1 << 4
  ];
  Tables.t33HB = [
    15 << 0,
    14 << 1,
    13 << 1,
    12 << 2,
    11 << 1,
    10 << 2,
    9 << 2,
    8 << 3,
    7 << 1,
    6 << 2,
    5 << 2,
    4 << 3,
    3 << 2,
    2 << 3,
    1 << 3,
    0 << 4
  ];
  Tables.t1l = [
    1,
    4,
    3,
    5
  ];
  Tables.t2l = [
    1,
    4,
    7,
    4,
    5,
    7,
    6,
    7,
    8
  ];
  Tables.t3l = [
    2,
    3,
    7,
    4,
    4,
    7,
    6,
    7,
    8
  ];
  Tables.t5l = [
    1,
    4,
    7,
    8,
    4,
    5,
    8,
    9,
    7,
    8,
    9,
    10,
    8,
    8,
    9,
    10
  ];
  Tables.t6l = [
    3,
    4,
    6,
    8,
    4,
    4,
    6,
    7,
    5,
    6,
    7,
    8,
    7,
    7,
    8,
    9
  ];
  Tables.t7l = [
    1,
    4,
    7,
    9,
    9,
    10,
    4,
    6,
    8,
    9,
    9,
    10,
    7,
    7,
    9,
    10,
    10,
    11,
    8,
    9,
    10,
    11,
    11,
    11,
    8,
    9,
    10,
    11,
    11,
    12,
    9,
    10,
    11,
    12,
    12,
    12
  ];
  Tables.t8l = [
    2,
    4,
    7,
    9,
    9,
    10,
    4,
    4,
    6,
    10,
    10,
    10,
    7,
    6,
    8,
    10,
    10,
    11,
    9,
    10,
    10,
    11,
    11,
    12,
    9,
    9,
    10,
    11,
    12,
    12,
    10,
    10,
    11,
    11,
    13,
    13
  ];
  Tables.t9l = [
    3,
    4,
    6,
    7,
    9,
    10,
    4,
    5,
    6,
    7,
    8,
    10,
    5,
    6,
    7,
    8,
    9,
    10,
    7,
    7,
    8,
    9,
    9,
    10,
    8,
    8,
    9,
    9,
    10,
    11,
    9,
    9,
    10,
    10,
    11,
    11
  ];
  Tables.t10l = [
    1,
    4,
    7,
    9,
    10,
    10,
    10,
    11,
    4,
    6,
    8,
    9,
    10,
    11,
    10,
    10,
    7,
    8,
    9,
    10,
    11,
    12,
    11,
    11,
    8,
    9,
    10,
    11,
    12,
    12,
    11,
    12,
    9,
    10,
    11,
    12,
    12,
    12,
    12,
    12,
    10,
    11,
    12,
    12,
    13,
    13,
    12,
    13,
    9,
    10,
    11,
    12,
    12,
    12,
    13,
    13,
    10,
    10,
    11,
    12,
    12,
    13,
    13,
    13
  ];
  Tables.t11l = [
    2,
    4,
    6,
    8,
    9,
    10,
    9,
    10,
    4,
    5,
    6,
    8,
    10,
    10,
    9,
    10,
    6,
    7,
    8,
    9,
    10,
    11,
    10,
    10,
    8,
    8,
    9,
    11,
    10,
    12,
    10,
    11,
    9,
    10,
    10,
    11,
    11,
    12,
    11,
    12,
    9,
    10,
    11,
    12,
    12,
    13,
    12,
    13,
    9,
    9,
    9,
    10,
    11,
    12,
    12,
    12,
    9,
    9,
    10,
    11,
    12,
    12,
    12,
    12
  ];
  Tables.t12l = [
    4,
    4,
    6,
    8,
    9,
    10,
    10,
    10,
    4,
    5,
    6,
    7,
    9,
    9,
    10,
    10,
    6,
    6,
    7,
    8,
    9,
    10,
    9,
    10,
    7,
    7,
    8,
    8,
    9,
    10,
    10,
    10,
    8,
    8,
    9,
    9,
    10,
    10,
    10,
    11,
    9,
    9,
    10,
    10,
    10,
    11,
    10,
    11,
    9,
    9,
    9,
    10,
    10,
    11,
    11,
    12,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12
  ];
  Tables.t13l = [
    1,
    5,
    7,
    8,
    9,
    10,
    10,
    11,
    10,
    11,
    12,
    12,
    13,
    13,
    14,
    14,
    4,
    6,
    8,
    9,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    13,
    14,
    14,
    14,
    7,
    8,
    9,
    10,
    11,
    11,
    12,
    12,
    11,
    12,
    12,
    13,
    13,
    14,
    15,
    15,
    8,
    9,
    10,
    11,
    11,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    14,
    15,
    15,
    9,
    9,
    11,
    11,
    12,
    12,
    13,
    13,
    12,
    13,
    13,
    14,
    14,
    15,
    15,
    16,
    10,
    10,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    14,
    13,
    15,
    15,
    16,
    16,
    10,
    11,
    12,
    12,
    13,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    15,
    15,
    16,
    16,
    11,
    11,
    12,
    13,
    13,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    15,
    16,
    18,
    18,
    10,
    10,
    11,
    12,
    12,
    13,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    16,
    17,
    17,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    15,
    14,
    15,
    15,
    16,
    16,
    16,
    18,
    17,
    11,
    12,
    12,
    13,
    13,
    14,
    14,
    15,
    14,
    15,
    16,
    15,
    16,
    17,
    18,
    19,
    12,
    12,
    12,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    15,
    16,
    17,
    17,
    17,
    18,
    12,
    13,
    13,
    14,
    14,
    15,
    14,
    15,
    16,
    16,
    17,
    17,
    17,
    18,
    18,
    18,
    13,
    13,
    14,
    15,
    15,
    15,
    16,
    16,
    16,
    16,
    16,
    17,
    18,
    17,
    18,
    18,
    14,
    14,
    14,
    15,
    15,
    15,
    17,
    16,
    16,
    19,
    17,
    17,
    17,
    19,
    18,
    18,
    13,
    14,
    15,
    16,
    16,
    16,
    17,
    16,
    17,
    17,
    18,
    18,
    21,
    20,
    21,
    18
  ];
  Tables.t15l = [
    3,
    5,
    6,
    8,
    8,
    9,
    10,
    10,
    10,
    11,
    11,
    12,
    12,
    12,
    13,
    14,
    5,
    5,
    7,
    8,
    9,
    9,
    10,
    10,
    10,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    6,
    7,
    7,
    8,
    9,
    9,
    10,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    7,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    8,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    9,
    9,
    9,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    10,
    9,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    14,
    14,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    14,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    13,
    13,
    14,
    14,
    14,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    14,
    15,
    14,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    15,
    12,
    12,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    13,
    13,
    14,
    14,
    15,
    15,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    14,
    14,
    15,
    15,
    13,
    13,
    13,
    13,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    14,
    15,
    13,
    13,
    13,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    14,
    14,
    15,
    15,
    15,
    15
  ];
  Tables.t16_5l = [
    1,
    5,
    7,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    14,
    11,
    4,
    6,
    8,
    9,
    10,
    11,
    11,
    11,
    12,
    12,
    12,
    13,
    14,
    13,
    14,
    11,
    7,
    8,
    9,
    10,
    11,
    11,
    12,
    12,
    13,
    12,
    13,
    13,
    13,
    14,
    14,
    12,
    9,
    9,
    10,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    14,
    14,
    14,
    15,
    15,
    13,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    14,
    14,
    15,
    15,
    15,
    12,
    10,
    10,
    11,
    11,
    12,
    13,
    13,
    14,
    13,
    14,
    14,
    15,
    15,
    15,
    16,
    13,
    11,
    11,
    11,
    12,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    16,
    13,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    14,
    15,
    15,
    15,
    15,
    17,
    17,
    13,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    14,
    15,
    15,
    15,
    15,
    16,
    16,
    16,
    13,
    12,
    12,
    12,
    13,
    13,
    14,
    14,
    15,
    15,
    15,
    15,
    16,
    15,
    16,
    15,
    14,
    12,
    13,
    12,
    13,
    14,
    14,
    14,
    14,
    15,
    16,
    16,
    16,
    17,
    17,
    16,
    13,
    13,
    13,
    13,
    13,
    14,
    14,
    15,
    16,
    16,
    16,
    16,
    16,
    16,
    15,
    16,
    14,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    15,
    15,
    17,
    16,
    16,
    16,
    16,
    18,
    14,
    15,
    14,
    14,
    14,
    15,
    15,
    16,
    16,
    16,
    18,
    17,
    17,
    17,
    19,
    17,
    14,
    14,
    15,
    13,
    14,
    16,
    16,
    15,
    16,
    16,
    17,
    18,
    17,
    19,
    17,
    16,
    14,
    11,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    14,
    14,
    14,
    14,
    14,
    14,
    12
  ];
  Tables.t16l = [
    1,
    5,
    7,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    14,
    10,
    4,
    6,
    8,
    9,
    10,
    11,
    11,
    11,
    12,
    12,
    12,
    13,
    14,
    13,
    14,
    10,
    7,
    8,
    9,
    10,
    11,
    11,
    12,
    12,
    13,
    12,
    13,
    13,
    13,
    14,
    14,
    11,
    9,
    9,
    10,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    14,
    14,
    14,
    15,
    15,
    12,
    10,
    10,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    14,
    14,
    15,
    15,
    15,
    11,
    10,
    10,
    11,
    11,
    12,
    13,
    13,
    14,
    13,
    14,
    14,
    15,
    15,
    15,
    16,
    12,
    11,
    11,
    11,
    12,
    13,
    13,
    13,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    16,
    12,
    11,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    14,
    15,
    15,
    15,
    15,
    17,
    17,
    12,
    11,
    12,
    12,
    13,
    13,
    13,
    14,
    14,
    15,
    15,
    15,
    15,
    16,
    16,
    16,
    12,
    12,
    12,
    12,
    13,
    13,
    14,
    14,
    15,
    15,
    15,
    15,
    16,
    15,
    16,
    15,
    13,
    12,
    13,
    12,
    13,
    14,
    14,
    14,
    14,
    15,
    16,
    16,
    16,
    17,
    17,
    16,
    12,
    13,
    13,
    13,
    13,
    14,
    14,
    15,
    16,
    16,
    16,
    16,
    16,
    16,
    15,
    16,
    13,
    13,
    14,
    14,
    14,
    14,
    15,
    15,
    15,
    15,
    17,
    16,
    16,
    16,
    16,
    18,
    13,
    15,
    14,
    14,
    14,
    15,
    15,
    16,
    16,
    16,
    18,
    17,
    17,
    17,
    19,
    17,
    13,
    14,
    15,
    13,
    14,
    16,
    16,
    15,
    16,
    16,
    17,
    18,
    17,
    19,
    17,
    16,
    13,
    10,
    10,
    10,
    11,
    11,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    13,
    13,
    13,
    10
  ];
  Tables.t24l = [
    4,
    5,
    7,
    8,
    9,
    10,
    10,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    13,
    10,
    5,
    6,
    7,
    8,
    9,
    10,
    10,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    10,
    7,
    7,
    8,
    9,
    9,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    13,
    9,
    8,
    8,
    9,
    9,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    9,
    9,
    9,
    9,
    10,
    10,
    10,
    10,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    13,
    9,
    10,
    9,
    10,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    9,
    10,
    10,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    13,
    9,
    11,
    10,
    10,
    10,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    10,
    11,
    11,
    11,
    11,
    11,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    13,
    13,
    10,
    11,
    11,
    11,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    10,
    12,
    11,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    10,
    12,
    12,
    11,
    11,
    11,
    12,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    10,
    12,
    12,
    12,
    12,
    12,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    13,
    10,
    12,
    12,
    12,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    13,
    13,
    13,
    10,
    13,
    12,
    12,
    12,
    12,
    12,
    12,
    13,
    13,
    13,
    13,
    13,
    13,
    13,
    13,
    10,
    9,
    9,
    9,
    9,
    9,
    9,
    9,
    9,
    9,
    9,
    9,
    10,
    10,
    10,
    10,
    6
  ];
  Tables.t32l = [
    1 + 0,
    4 + 1,
    4 + 1,
    5 + 2,
    4 + 1,
    6 + 2,
    5 + 2,
    6 + 3,
    4 + 1,
    5 + 2,
    5 + 2,
    6 + 3,
    5 + 2,
    6 + 3,
    6 + 3,
    6 + 4
  ];
  Tables.t33l = [
    4 + 0,
    4 + 1,
    4 + 1,
    4 + 2,
    4 + 1,
    4 + 2,
    4 + 2,
    4 + 3,
    4 + 1,
    4 + 2,
    4 + 2,
    4 + 3,
    4 + 2,
    4 + 3,
    4 + 3,
    4 + 4
  ];
  Tables.ht = [
    /* xlen, linmax, table, hlen */
    new HuffCodeTab(0, 0, null, null),
    new HuffCodeTab(2, 0, Tables.t1HB, Tables.t1l),
    new HuffCodeTab(3, 0, Tables.t2HB, Tables.t2l),
    new HuffCodeTab(3, 0, Tables.t3HB, Tables.t3l),
    new HuffCodeTab(0, 0, null, null),
    /* Apparently not used */
    new HuffCodeTab(4, 0, Tables.t5HB, Tables.t5l),
    new HuffCodeTab(4, 0, Tables.t6HB, Tables.t6l),
    new HuffCodeTab(6, 0, Tables.t7HB, Tables.t7l),
    new HuffCodeTab(6, 0, Tables.t8HB, Tables.t8l),
    new HuffCodeTab(6, 0, Tables.t9HB, Tables.t9l),
    new HuffCodeTab(8, 0, Tables.t10HB, Tables.t10l),
    new HuffCodeTab(8, 0, Tables.t11HB, Tables.t11l),
    new HuffCodeTab(8, 0, Tables.t12HB, Tables.t12l),
    new HuffCodeTab(16, 0, Tables.t13HB, Tables.t13l),
    new HuffCodeTab(0, 0, null, Tables.t16_5l),
    /* Apparently not used */
    new HuffCodeTab(16, 0, Tables.t15HB, Tables.t15l),
    new HuffCodeTab(1, 1, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(2, 3, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(3, 7, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(4, 15, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(6, 63, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(8, 255, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(10, 1023, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(13, 8191, Tables.t16HB, Tables.t16l),
    new HuffCodeTab(4, 15, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(5, 31, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(6, 63, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(7, 127, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(8, 255, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(9, 511, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(11, 2047, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(13, 8191, Tables.t24HB, Tables.t24l),
    new HuffCodeTab(0, 0, Tables.t32HB, Tables.t32l),
    new HuffCodeTab(0, 0, Tables.t33HB, Tables.t33l)
  ];
  Tables.largetbl = [
    65540,
    327685,
    458759,
    589832,
    655369,
    655370,
    720906,
    720907,
    786443,
    786444,
    786444,
    851980,
    851980,
    851980,
    917517,
    655370,
    262149,
    393222,
    524295,
    589832,
    655369,
    720906,
    720906,
    720907,
    786443,
    786443,
    786444,
    851980,
    917516,
    851980,
    917516,
    655370,
    458759,
    524295,
    589832,
    655369,
    720905,
    720906,
    786442,
    786443,
    851979,
    786443,
    851979,
    851980,
    851980,
    917516,
    917517,
    720905,
    589832,
    589832,
    655369,
    720905,
    720906,
    786442,
    786442,
    786443,
    851979,
    851979,
    917515,
    917516,
    917516,
    983052,
    983052,
    786441,
    655369,
    655369,
    720905,
    720906,
    786442,
    786442,
    851978,
    851979,
    851979,
    917515,
    917516,
    917516,
    983052,
    983052,
    983053,
    720905,
    655370,
    655369,
    720906,
    720906,
    786442,
    851978,
    851979,
    917515,
    851979,
    917515,
    917516,
    983052,
    983052,
    983052,
    1048588,
    786441,
    720906,
    720906,
    720906,
    786442,
    851978,
    851979,
    851979,
    851979,
    917515,
    917516,
    917516,
    917516,
    983052,
    983052,
    1048589,
    786441,
    720907,
    720906,
    786442,
    786442,
    851979,
    851979,
    851979,
    917515,
    917516,
    983052,
    983052,
    983052,
    983052,
    1114125,
    1114125,
    786442,
    720907,
    786443,
    786443,
    851979,
    851979,
    851979,
    917515,
    917515,
    983051,
    983052,
    983052,
    983052,
    1048588,
    1048589,
    1048589,
    786442,
    786443,
    786443,
    786443,
    851979,
    851979,
    917515,
    917515,
    983052,
    983052,
    983052,
    983052,
    1048588,
    983053,
    1048589,
    983053,
    851978,
    786444,
    851979,
    786443,
    851979,
    917515,
    917516,
    917516,
    917516,
    983052,
    1048588,
    1048588,
    1048589,
    1114125,
    1114125,
    1048589,
    786442,
    851980,
    851980,
    851979,
    851979,
    917515,
    917516,
    983052,
    1048588,
    1048588,
    1048588,
    1048588,
    1048589,
    1048589,
    983053,
    1048589,
    851978,
    851980,
    917516,
    917516,
    917516,
    917516,
    983052,
    983052,
    983052,
    983052,
    1114124,
    1048589,
    1048589,
    1048589,
    1048589,
    1179661,
    851978,
    983052,
    917516,
    917516,
    917516,
    983052,
    983052,
    1048588,
    1048588,
    1048589,
    1179661,
    1114125,
    1114125,
    1114125,
    1245197,
    1114125,
    851978,
    917517,
    983052,
    851980,
    917516,
    1048588,
    1048588,
    983052,
    1048589,
    1048589,
    1114125,
    1179661,
    1114125,
    1245197,
    1114125,
    1048589,
    851978,
    655369,
    655369,
    655369,
    720905,
    720905,
    786441,
    786441,
    786441,
    851977,
    851977,
    851977,
    851978,
    851978,
    851978,
    851978,
    655366
  ];
  Tables.table23 = [
    65538,
    262147,
    458759,
    262148,
    327684,
    458759,
    393222,
    458759,
    524296
  ];
  Tables.table56 = [
    65539,
    262148,
    458758,
    524296,
    262148,
    327684,
    524294,
    589831,
    458757,
    524294,
    589831,
    655368,
    524295,
    524295,
    589832,
    655369
  ];
  Tables.bitrate_table = [
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, -1],
    /* MPEG 2 */
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, -1],
    /* MPEG 1 */
    [0, 8, 16, 24, 32, 40, 48, 56, 64, -1, -1, -1, -1, -1, -1, -1]
    /* MPEG 2.5 */
  ];
  Tables.samplerate_table = [
    [22050, 24e3, 16e3, -1],
    [44100, 48e3, 32e3, -1],
    [11025, 12e3, 8e3, -1]
  ];
  Tables.scfsi_band = [0, 6, 11, 16, 21];
  function MeanBits(meanBits) {
    this.bits = meanBits;
  }
  function VBRQuantize() {
    var qupvt;
    var tak;
    this.setModules = function(_qupvt, _tk) {
      qupvt = _qupvt;
      tak = _tk;
    };
  }
  function CalcNoiseResult() {
    this.over_noise = 0;
    this.tot_noise = 0;
    this.max_noise = 0;
    this.over_count = 0;
    this.over_SSD = 0;
    this.bits = 0;
  }
  function LameGlobalFlags() {
    this.class_id = 0;
    this.num_samples = 0;
    this.num_channels = 0;
    this.in_samplerate = 0;
    this.out_samplerate = 0;
    this.scale = 0;
    this.scale_left = 0;
    this.scale_right = 0;
    this.analysis = false;
    this.bWriteVbrTag = false;
    this.decode_only = false;
    this.quality = 0;
    this.mode = MPEGMode.STEREO;
    this.force_ms = false;
    this.free_format = false;
    this.findReplayGain = false;
    this.decode_on_the_fly = false;
    this.write_id3tag_automatic = false;
    this.brate = 0;
    this.compression_ratio = 0;
    this.copyright = 0;
    this.original = 0;
    this.extension = 0;
    this.emphasis = 0;
    this.error_protection = 0;
    this.strict_ISO = false;
    this.disable_reservoir = false;
    this.quant_comp = 0;
    this.quant_comp_short = 0;
    this.experimentalY = false;
    this.experimentalZ = 0;
    this.exp_nspsytune = 0;
    this.preset = 0;
    this.VBR = null;
    this.VBR_q_frac = 0;
    this.VBR_q = 0;
    this.VBR_mean_bitrate_kbps = 0;
    this.VBR_min_bitrate_kbps = 0;
    this.VBR_max_bitrate_kbps = 0;
    this.VBR_hard_min = 0;
    this.lowpassfreq = 0;
    this.highpassfreq = 0;
    this.lowpasswidth = 0;
    this.highpasswidth = 0;
    this.maskingadjust = 0;
    this.maskingadjust_short = 0;
    this.ATHonly = false;
    this.ATHshort = false;
    this.noATH = false;
    this.ATHtype = 0;
    this.ATHcurve = 0;
    this.ATHlower = 0;
    this.athaa_type = 0;
    this.athaa_loudapprox = 0;
    this.athaa_sensitivity = 0;
    this.short_blocks = null;
    this.useTemporal = false;
    this.interChRatio = 0;
    this.msfix = 0;
    this.tune = false;
    this.tune_value_a = 0;
    this.version = 0;
    this.encoder_delay = 0;
    this.encoder_padding = 0;
    this.framesize = 0;
    this.frameNum = 0;
    this.lame_allocated_gfp = 0;
    this.internal_flags = null;
  }
  function ReplayGain() {
    this.linprebuf = new_float(GainAnalysis.MAX_ORDER * 2);
    this.linpre = 0;
    this.lstepbuf = new_float(GainAnalysis.MAX_SAMPLES_PER_WINDOW + GainAnalysis.MAX_ORDER);
    this.lstep = 0;
    this.loutbuf = new_float(GainAnalysis.MAX_SAMPLES_PER_WINDOW + GainAnalysis.MAX_ORDER);
    this.lout = 0;
    this.rinprebuf = new_float(GainAnalysis.MAX_ORDER * 2);
    this.rinpre = 0;
    this.rstepbuf = new_float(GainAnalysis.MAX_SAMPLES_PER_WINDOW + GainAnalysis.MAX_ORDER);
    this.rstep = 0;
    this.routbuf = new_float(GainAnalysis.MAX_SAMPLES_PER_WINDOW + GainAnalysis.MAX_ORDER);
    this.rout = 0;
    this.sampleWindow = 0;
    this.totsamp = 0;
    this.lsum = 0;
    this.rsum = 0;
    this.freqindex = 0;
    this.first = 0;
    this.A = new_int(0 | GainAnalysis.STEPS_per_dB * GainAnalysis.MAX_dB);
    this.B = new_int(0 | GainAnalysis.STEPS_per_dB * GainAnalysis.MAX_dB);
  }
  function CBRNewIterationLoop(_quantize) {
    var quantize = _quantize;
    this.quantize = quantize;
    this.iteration_loop = function(gfp, pe, ms_ener_ratio, ratio) {
      var gfc = gfp.internal_flags;
      var l3_xmin = new_float(L3Side.SFBMAX);
      var xrpow = new_float(576);
      var targ_bits = new_int(2);
      var mean_bits = 0, max_bits;
      var l3_side = gfc.l3_side;
      var mb = new MeanBits(mean_bits);
      this.quantize.rv.ResvFrameBegin(gfp, mb);
      mean_bits = mb.bits;
      for (var gr = 0; gr < gfc.mode_gr; gr++) {
        max_bits = this.quantize.qupvt.on_pe(
          gfp,
          pe,
          targ_bits,
          mean_bits,
          gr,
          gr
        );
        if (gfc.mode_ext == Encoder.MPG_MD_MS_LR) {
          this.quantize.ms_convert(gfc.l3_side, gr);
          this.quantize.qupvt.reduce_side(
            targ_bits,
            ms_ener_ratio[gr],
            mean_bits,
            max_bits
          );
        }
        for (var ch = 0; ch < gfc.channels_out; ch++) {
          var adjust, masking_lower_db;
          var cod_info = l3_side.tt[gr][ch];
          if (cod_info.block_type != Encoder.SHORT_TYPE) {
            adjust = 0;
            masking_lower_db = gfc.PSY.mask_adjust - adjust;
          } else {
            adjust = 0;
            masking_lower_db = gfc.PSY.mask_adjust_short - adjust;
          }
          gfc.masking_lower = Math.pow(
            10,
            masking_lower_db * 0.1
          );
          this.quantize.init_outer_loop(gfc, cod_info);
          if (this.quantize.init_xrpow(gfc, cod_info, xrpow)) {
            this.quantize.qupvt.calc_xmin(
              gfp,
              ratio[gr][ch],
              cod_info,
              l3_xmin
            );
            this.quantize.outer_loop(
              gfp,
              cod_info,
              l3_xmin,
              xrpow,
              ch,
              targ_bits[ch]
            );
          }
          this.quantize.iteration_finish_one(gfc, gr, ch);
        }
      }
      this.quantize.rv.ResvFrameEnd(gfc, mean_bits);
    };
  }
  function ATH() {
    this.useAdjust = 0;
    this.aaSensitivityP = 0;
    this.adjust = 0;
    this.adjustLimit = 0;
    this.decay = 0;
    this.floor = 0;
    this.l = new_float(Encoder.SBMAX_l);
    this.s = new_float(Encoder.SBMAX_s);
    this.psfb21 = new_float(Encoder.PSFB21);
    this.psfb12 = new_float(Encoder.PSFB12);
    this.cb_l = new_float(Encoder.CBANDS);
    this.cb_s = new_float(Encoder.CBANDS);
    this.eql_w = new_float(Encoder.BLKSIZE / 2);
  }
  function ScaleFac(arrL, arrS, arr21, arr12) {
    this.l = new_int(1 + Encoder.SBMAX_l);
    this.s = new_int(1 + Encoder.SBMAX_s);
    this.psfb21 = new_int(1 + Encoder.PSFB21);
    this.psfb12 = new_int(1 + Encoder.PSFB12);
    var l = this.l;
    var s = this.s;
    if (arguments.length == 4) {
      this.arrL = arguments[0];
      this.arrS = arguments[1];
      this.arr21 = arguments[2];
      this.arr12 = arguments[3];
      System.arraycopy(this.arrL, 0, l, 0, Math.min(this.arrL.length, this.l.length));
      System.arraycopy(this.arrS, 0, s, 0, Math.min(this.arrS.length, this.s.length));
      System.arraycopy(this.arr21, 0, this.psfb21, 0, Math.min(this.arr21.length, this.psfb21.length));
      System.arraycopy(this.arr12, 0, this.psfb12, 0, Math.min(this.arr12.length, this.psfb12.length));
    }
  }
  QuantizePVT.Q_MAX = 256 + 1;
  QuantizePVT.Q_MAX2 = 116;
  QuantizePVT.LARGE_BITS = 1e5;
  QuantizePVT.IXMAX_VAL = 8206;
  function QuantizePVT() {
    var tak = null;
    var rv = null;
    var psy = null;
    this.setModules = function(_tk, _rv, _psy) {
      tak = _tk;
      rv = _rv;
      psy = _psy;
    };
    function POW20(x) {
      return pow20[x + QuantizePVT.Q_MAX2];
    }
    this.IPOW20 = function(x) {
      return ipow20[x];
    };
    var DBL_EPSILON = 2220446049250313e-31;
    var IXMAX_VAL = QuantizePVT.IXMAX_VAL;
    var PRECALC_SIZE = IXMAX_VAL + 2;
    var Q_MAX = QuantizePVT.Q_MAX;
    var Q_MAX2 = QuantizePVT.Q_MAX2;
    var LARGE_BITS = QuantizePVT.LARGE_BITS;
    var NSATHSCALE = 100;
    this.nr_of_sfb_block = [
      [[6, 5, 5, 5], [9, 9, 9, 9], [6, 9, 9, 9]],
      [[6, 5, 7, 3], [9, 9, 12, 6], [6, 9, 12, 6]],
      [[11, 10, 0, 0], [18, 18, 0, 0], [15, 18, 0, 0]],
      [[7, 7, 7, 0], [12, 12, 12, 0], [6, 15, 12, 0]],
      [[6, 6, 6, 3], [12, 9, 9, 6], [6, 12, 9, 6]],
      [[8, 8, 5, 0], [15, 12, 9, 0], [6, 18, 9, 0]]
    ];
    var pretab = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      1,
      1,
      1,
      1,
      2,
      2,
      3,
      3,
      3,
      2,
      0
    ];
    this.pretab = pretab;
    this.sfBandIndex = [
      // Table B.2.b: 22.05 kHz
      new ScaleFac(
        [
          0,
          6,
          12,
          18,
          24,
          30,
          36,
          44,
          54,
          66,
          80,
          96,
          116,
          140,
          168,
          200,
          238,
          284,
          336,
          396,
          464,
          522,
          576
        ],
        [0, 4, 8, 12, 18, 24, 32, 42, 56, 74, 100, 132, 174, 192],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        //  sfb12 pseudo sub bands
      ),
      /* Table B.2.c: 24 kHz */
      /* docs: 332. mpg123(broken): 330 */
      new ScaleFac(
        [
          0,
          6,
          12,
          18,
          24,
          30,
          36,
          44,
          54,
          66,
          80,
          96,
          114,
          136,
          162,
          194,
          232,
          278,
          332,
          394,
          464,
          540,
          576
        ],
        [0, 4, 8, 12, 18, 26, 36, 48, 62, 80, 104, 136, 180, 192],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      ),
      /* Table B.2.a: 16 kHz */
      new ScaleFac(
        [
          0,
          6,
          12,
          18,
          24,
          30,
          36,
          44,
          54,
          66,
          80,
          96,
          116,
          140,
          168,
          200,
          238,
          284,
          336,
          396,
          464,
          522,
          576
        ],
        [0, 4, 8, 12, 18, 26, 36, 48, 62, 80, 104, 134, 174, 192],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      ),
      /* Table B.8.b: 44.1 kHz */
      new ScaleFac(
        [
          0,
          4,
          8,
          12,
          16,
          20,
          24,
          30,
          36,
          44,
          52,
          62,
          74,
          90,
          110,
          134,
          162,
          196,
          238,
          288,
          342,
          418,
          576
        ],
        [0, 4, 8, 12, 16, 22, 30, 40, 52, 66, 84, 106, 136, 192],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      ),
      /* Table B.8.c: 48 kHz */
      new ScaleFac(
        [
          0,
          4,
          8,
          12,
          16,
          20,
          24,
          30,
          36,
          42,
          50,
          60,
          72,
          88,
          106,
          128,
          156,
          190,
          230,
          276,
          330,
          384,
          576
        ],
        [0, 4, 8, 12, 16, 22, 28, 38, 50, 64, 80, 100, 126, 192],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      ),
      /* Table B.8.a: 32 kHz */
      new ScaleFac(
        [
          0,
          4,
          8,
          12,
          16,
          20,
          24,
          30,
          36,
          44,
          54,
          66,
          82,
          102,
          126,
          156,
          194,
          240,
          296,
          364,
          448,
          550,
          576
        ],
        [0, 4, 8, 12, 16, 22, 30, 42, 58, 78, 104, 138, 180, 192],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      ),
      /* MPEG-2.5 11.025 kHz */
      new ScaleFac(
        [
          0,
          6,
          12,
          18,
          24,
          30,
          36,
          44,
          54,
          66,
          80,
          96,
          116,
          140,
          168,
          200,
          238,
          284,
          336,
          396,
          464,
          522,
          576
        ],
        [
          0 / 3,
          12 / 3,
          24 / 3,
          36 / 3,
          54 / 3,
          78 / 3,
          108 / 3,
          144 / 3,
          186 / 3,
          240 / 3,
          312 / 3,
          402 / 3,
          522 / 3,
          576 / 3
        ],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      ),
      /* MPEG-2.5 12 kHz */
      new ScaleFac(
        [
          0,
          6,
          12,
          18,
          24,
          30,
          36,
          44,
          54,
          66,
          80,
          96,
          116,
          140,
          168,
          200,
          238,
          284,
          336,
          396,
          464,
          522,
          576
        ],
        [
          0 / 3,
          12 / 3,
          24 / 3,
          36 / 3,
          54 / 3,
          78 / 3,
          108 / 3,
          144 / 3,
          186 / 3,
          240 / 3,
          312 / 3,
          402 / 3,
          522 / 3,
          576 / 3
        ],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      ),
      /* MPEG-2.5 8 kHz */
      new ScaleFac(
        [
          0,
          12,
          24,
          36,
          48,
          60,
          72,
          88,
          108,
          132,
          160,
          192,
          232,
          280,
          336,
          400,
          476,
          566,
          568,
          570,
          572,
          574,
          576
        ],
        [
          0 / 3,
          24 / 3,
          48 / 3,
          72 / 3,
          108 / 3,
          156 / 3,
          216 / 3,
          288 / 3,
          372 / 3,
          480 / 3,
          486 / 3,
          492 / 3,
          498 / 3,
          576 / 3
        ],
        [0, 0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0, 0]
        /*  sfb12 pseudo sub bands */
      )
    ];
    var pow20 = new_float(Q_MAX + Q_MAX2 + 1);
    var ipow20 = new_float(Q_MAX);
    var pow43 = new_float(PRECALC_SIZE);
    var adj43 = new_float(PRECALC_SIZE);
    this.adj43 = adj43;
    function ATHmdct(gfp, f) {
      var ath = psy.ATHformula(f, gfp);
      ath -= NSATHSCALE;
      ath = Math.pow(10, ath / 10 + gfp.ATHlower);
      return ath;
    }
    function compute_ath(gfp) {
      var ATH_l = gfp.internal_flags.ATH.l;
      var ATH_psfb21 = gfp.internal_flags.ATH.psfb21;
      var ATH_s = gfp.internal_flags.ATH.s;
      var ATH_psfb12 = gfp.internal_flags.ATH.psfb12;
      var gfc = gfp.internal_flags;
      var samp_freq = gfp.out_samplerate;
      for (var sfb = 0; sfb < Encoder.SBMAX_l; sfb++) {
        var start = gfc.scalefac_band.l[sfb];
        var end = gfc.scalefac_band.l[sfb + 1];
        ATH_l[sfb] = Float.MAX_VALUE;
        for (var i = start; i < end; i++) {
          var freq = i * samp_freq / (2 * 576);
          var ATH_f = ATHmdct(gfp, freq);
          ATH_l[sfb] = Math.min(ATH_l[sfb], ATH_f);
        }
      }
      for (var sfb = 0; sfb < Encoder.PSFB21; sfb++) {
        var start = gfc.scalefac_band.psfb21[sfb];
        var end = gfc.scalefac_band.psfb21[sfb + 1];
        ATH_psfb21[sfb] = Float.MAX_VALUE;
        for (var i = start; i < end; i++) {
          var freq = i * samp_freq / (2 * 576);
          var ATH_f = ATHmdct(gfp, freq);
          ATH_psfb21[sfb] = Math.min(ATH_psfb21[sfb], ATH_f);
        }
      }
      for (var sfb = 0; sfb < Encoder.SBMAX_s; sfb++) {
        var start = gfc.scalefac_band.s[sfb];
        var end = gfc.scalefac_band.s[sfb + 1];
        ATH_s[sfb] = Float.MAX_VALUE;
        for (var i = start; i < end; i++) {
          var freq = i * samp_freq / (2 * 192);
          var ATH_f = ATHmdct(gfp, freq);
          ATH_s[sfb] = Math.min(ATH_s[sfb], ATH_f);
        }
        ATH_s[sfb] *= gfc.scalefac_band.s[sfb + 1] - gfc.scalefac_band.s[sfb];
      }
      for (var sfb = 0; sfb < Encoder.PSFB12; sfb++) {
        var start = gfc.scalefac_band.psfb12[sfb];
        var end = gfc.scalefac_band.psfb12[sfb + 1];
        ATH_psfb12[sfb] = Float.MAX_VALUE;
        for (var i = start; i < end; i++) {
          var freq = i * samp_freq / (2 * 192);
          var ATH_f = ATHmdct(gfp, freq);
          ATH_psfb12[sfb] = Math.min(ATH_psfb12[sfb], ATH_f);
        }
        ATH_psfb12[sfb] *= gfc.scalefac_band.s[13] - gfc.scalefac_band.s[12];
      }
      if (gfp.noATH) {
        for (var sfb = 0; sfb < Encoder.SBMAX_l; sfb++) {
          ATH_l[sfb] = 1e-20;
        }
        for (var sfb = 0; sfb < Encoder.PSFB21; sfb++) {
          ATH_psfb21[sfb] = 1e-20;
        }
        for (var sfb = 0; sfb < Encoder.SBMAX_s; sfb++) {
          ATH_s[sfb] = 1e-20;
        }
        for (var sfb = 0; sfb < Encoder.PSFB12; sfb++) {
          ATH_psfb12[sfb] = 1e-20;
        }
      }
      gfc.ATH.floor = 10 * Math.log10(ATHmdct(gfp, -1));
    }
    this.iteration_init = function(gfp) {
      var gfc = gfp.internal_flags;
      var l3_side = gfc.l3_side;
      var i;
      if (gfc.iteration_init_init == 0) {
        gfc.iteration_init_init = 1;
        l3_side.main_data_begin = 0;
        compute_ath(gfp);
        pow43[0] = 0;
        for (i = 1; i < PRECALC_SIZE; i++)
          pow43[i] = Math.pow(i, 4 / 3);
        for (i = 0; i < PRECALC_SIZE - 1; i++)
          adj43[i] = i + 1 - Math.pow(
            0.5 * (pow43[i] + pow43[i + 1]),
            0.75
          );
        adj43[i] = 0.5;
        for (i = 0; i < Q_MAX; i++)
          ipow20[i] = Math.pow(2, (i - 210) * -0.1875);
        for (i = 0; i <= Q_MAX + Q_MAX2; i++)
          pow20[i] = Math.pow(2, (i - 210 - Q_MAX2) * 0.25);
        tak.huffman_init(gfc);
        {
          var bass, alto, treble, sfb21;
          i = gfp.exp_nspsytune >> 2 & 63;
          if (i >= 32)
            i -= 64;
          bass = Math.pow(10, i / 4 / 10);
          i = gfp.exp_nspsytune >> 8 & 63;
          if (i >= 32)
            i -= 64;
          alto = Math.pow(10, i / 4 / 10);
          i = gfp.exp_nspsytune >> 14 & 63;
          if (i >= 32)
            i -= 64;
          treble = Math.pow(10, i / 4 / 10);
          i = gfp.exp_nspsytune >> 20 & 63;
          if (i >= 32)
            i -= 64;
          sfb21 = treble * Math.pow(10, i / 4 / 10);
          for (i = 0; i < Encoder.SBMAX_l; i++) {
            var f;
            if (i <= 6)
              f = bass;
            else if (i <= 13)
              f = alto;
            else if (i <= 20)
              f = treble;
            else
              f = sfb21;
            gfc.nsPsy.longfact[i] = f;
          }
          for (i = 0; i < Encoder.SBMAX_s; i++) {
            var f;
            if (i <= 5)
              f = bass;
            else if (i <= 10)
              f = alto;
            else if (i <= 11)
              f = treble;
            else
              f = sfb21;
            gfc.nsPsy.shortfact[i] = f;
          }
        }
      }
    };
    this.on_pe = function(gfp, pe, targ_bits, mean_bits, gr, cbr) {
      var gfc = gfp.internal_flags;
      var tbits = 0, bits;
      var add_bits = new_int(2);
      var ch;
      var mb = new MeanBits(tbits);
      var extra_bits = rv.ResvMaxBits(gfp, mean_bits, mb, cbr);
      tbits = mb.bits;
      var max_bits = tbits + extra_bits;
      if (max_bits > LameInternalFlags.MAX_BITS_PER_GRANULE) {
        max_bits = LameInternalFlags.MAX_BITS_PER_GRANULE;
      }
      for (bits = 0, ch = 0; ch < gfc.channels_out; ++ch) {
        targ_bits[ch] = Math.min(
          LameInternalFlags.MAX_BITS_PER_CHANNEL,
          tbits / gfc.channels_out
        );
        add_bits[ch] = 0 | targ_bits[ch] * pe[gr][ch] / 700 - targ_bits[ch];
        if (add_bits[ch] > mean_bits * 3 / 4)
          add_bits[ch] = mean_bits * 3 / 4;
        if (add_bits[ch] < 0)
          add_bits[ch] = 0;
        if (add_bits[ch] + targ_bits[ch] > LameInternalFlags.MAX_BITS_PER_CHANNEL)
          add_bits[ch] = Math.max(
            0,
            LameInternalFlags.MAX_BITS_PER_CHANNEL - targ_bits[ch]
          );
        bits += add_bits[ch];
      }
      if (bits > extra_bits) {
        for (ch = 0; ch < gfc.channels_out; ++ch) {
          add_bits[ch] = extra_bits * add_bits[ch] / bits;
        }
      }
      for (ch = 0; ch < gfc.channels_out; ++ch) {
        targ_bits[ch] += add_bits[ch];
        extra_bits -= add_bits[ch];
      }
      for (bits = 0, ch = 0; ch < gfc.channels_out; ++ch) {
        bits += targ_bits[ch];
      }
      if (bits > LameInternalFlags.MAX_BITS_PER_GRANULE) {
        var sum = 0;
        for (ch = 0; ch < gfc.channels_out; ++ch) {
          targ_bits[ch] *= LameInternalFlags.MAX_BITS_PER_GRANULE;
          targ_bits[ch] /= bits;
          sum += targ_bits[ch];
        }
      }
      return max_bits;
    };
    this.reduce_side = function(targ_bits, ms_ener_ratio, mean_bits, max_bits) {
      var fac = 0.33 * (0.5 - ms_ener_ratio) / 0.5;
      if (fac < 0)
        fac = 0;
      if (fac > 0.5)
        fac = 0.5;
      var move_bits = 0 | fac * 0.5 * (targ_bits[0] + targ_bits[1]);
      if (move_bits > LameInternalFlags.MAX_BITS_PER_CHANNEL - targ_bits[0]) {
        move_bits = LameInternalFlags.MAX_BITS_PER_CHANNEL - targ_bits[0];
      }
      if (move_bits < 0)
        move_bits = 0;
      if (targ_bits[1] >= 125) {
        if (targ_bits[1] - move_bits > 125) {
          if (targ_bits[0] < mean_bits)
            targ_bits[0] += move_bits;
          targ_bits[1] -= move_bits;
        } else {
          targ_bits[0] += targ_bits[1] - 125;
          targ_bits[1] = 125;
        }
      }
      move_bits = targ_bits[0] + targ_bits[1];
      if (move_bits > max_bits) {
        targ_bits[0] = max_bits * targ_bits[0] / move_bits;
        targ_bits[1] = max_bits * targ_bits[1] / move_bits;
      }
    };
    this.athAdjust = function(a, x, athFloor) {
      var o = 90.30873362;
      var p = 94.82444863;
      var u = Util.FAST_LOG10_X(x, 10);
      var v = a * a;
      var w = 0;
      u -= athFloor;
      if (v > 1e-20)
        w = 1 + Util.FAST_LOG10_X(v, 10 / o);
      if (w < 0)
        w = 0;
      u *= w;
      u += athFloor + o - p;
      return Math.pow(10, 0.1 * u);
    };
    this.calc_xmin = function(gfp, ratio, cod_info, pxmin) {
      var pxminPos = 0;
      var gfc = gfp.internal_flags;
      var gsfb, j = 0, ath_over = 0;
      var ATH2 = gfc.ATH;
      var xr = cod_info.xr;
      var enable_athaa_fix = gfp.VBR == VbrMode.vbr_mtrh ? 1 : 0;
      var masking_lower = gfc.masking_lower;
      if (gfp.VBR == VbrMode.vbr_mtrh || gfp.VBR == VbrMode.vbr_mt) {
        masking_lower = 1;
      }
      for (gsfb = 0; gsfb < cod_info.psy_lmax; gsfb++) {
        var en0, xmin;
        var rh1, rh2;
        var width, l;
        if (gfp.VBR == VbrMode.vbr_rh || gfp.VBR == VbrMode.vbr_mtrh)
          xmin = athAdjust(ATH2.adjust, ATH2.l[gsfb], ATH2.floor);
        else
          xmin = ATH2.adjust * ATH2.l[gsfb];
        width = cod_info.width[gsfb];
        rh1 = xmin / width;
        rh2 = DBL_EPSILON;
        l = width >> 1;
        en0 = 0;
        do {
          var xa, xb;
          xa = xr[j] * xr[j];
          en0 += xa;
          rh2 += xa < rh1 ? xa : rh1;
          j++;
          xb = xr[j] * xr[j];
          en0 += xb;
          rh2 += xb < rh1 ? xb : rh1;
          j++;
        } while (--l > 0);
        if (en0 > xmin)
          ath_over++;
        if (gsfb == Encoder.SBPSY_l) {
          var x = xmin * gfc.nsPsy.longfact[gsfb];
          if (rh2 < x) {
            rh2 = x;
          }
        }
        if (enable_athaa_fix != 0) {
          xmin = rh2;
        }
        if (!gfp.ATHonly) {
          var e = ratio.en.l[gsfb];
          if (e > 0) {
            var x;
            x = en0 * ratio.thm.l[gsfb] * masking_lower / e;
            if (enable_athaa_fix != 0)
              x *= gfc.nsPsy.longfact[gsfb];
            if (xmin < x)
              xmin = x;
          }
        }
        if (enable_athaa_fix != 0)
          pxmin[pxminPos++] = xmin;
        else
          pxmin[pxminPos++] = xmin * gfc.nsPsy.longfact[gsfb];
      }
      var max_nonzero = 575;
      if (cod_info.block_type != Encoder.SHORT_TYPE) {
        var k = 576;
        while (k-- != 0 && BitStream.EQ(xr[k], 0)) {
          max_nonzero = k;
        }
      }
      cod_info.max_nonzero_coeff = max_nonzero;
      for (var sfb = cod_info.sfb_smin; gsfb < cod_info.psymax; sfb++, gsfb += 3) {
        var width, b;
        var tmpATH;
        if (gfp.VBR == VbrMode.vbr_rh || gfp.VBR == VbrMode.vbr_mtrh)
          tmpATH = athAdjust(ATH2.adjust, ATH2.s[sfb], ATH2.floor);
        else
          tmpATH = ATH2.adjust * ATH2.s[sfb];
        width = cod_info.width[gsfb];
        for (b = 0; b < 3; b++) {
          var en0 = 0, xmin;
          var rh1, rh2;
          var l = width >> 1;
          rh1 = tmpATH / width;
          rh2 = DBL_EPSILON;
          do {
            var xa, xb;
            xa = xr[j] * xr[j];
            en0 += xa;
            rh2 += xa < rh1 ? xa : rh1;
            j++;
            xb = xr[j] * xr[j];
            en0 += xb;
            rh2 += xb < rh1 ? xb : rh1;
            j++;
          } while (--l > 0);
          if (en0 > tmpATH)
            ath_over++;
          if (sfb == Encoder.SBPSY_s) {
            var x = tmpATH * gfc.nsPsy.shortfact[sfb];
            if (rh2 < x) {
              rh2 = x;
            }
          }
          if (enable_athaa_fix != 0)
            xmin = rh2;
          else
            xmin = tmpATH;
          if (!gfp.ATHonly && !gfp.ATHshort) {
            var e = ratio.en.s[sfb][b];
            if (e > 0) {
              var x;
              x = en0 * ratio.thm.s[sfb][b] * masking_lower / e;
              if (enable_athaa_fix != 0)
                x *= gfc.nsPsy.shortfact[sfb];
              if (xmin < x)
                xmin = x;
            }
          }
          if (enable_athaa_fix != 0)
            pxmin[pxminPos++] = xmin;
          else
            pxmin[pxminPos++] = xmin * gfc.nsPsy.shortfact[sfb];
        }
        if (gfp.useTemporal) {
          if (pxmin[pxminPos - 3] > pxmin[pxminPos - 3 + 1])
            pxmin[pxminPos - 3 + 1] += (pxmin[pxminPos - 3] - pxmin[pxminPos - 3 + 1]) * gfc.decay;
          if (pxmin[pxminPos - 3 + 1] > pxmin[pxminPos - 3 + 2])
            pxmin[pxminPos - 3 + 2] += (pxmin[pxminPos - 3 + 1] - pxmin[pxminPos - 3 + 2]) * gfc.decay;
        }
      }
      return ath_over;
    };
    function StartLine(j) {
      this.s = j;
    }
    this.calc_noise_core = function(cod_info, startline, l, step) {
      var noise = 0;
      var j = startline.s;
      var ix = cod_info.l3_enc;
      if (j > cod_info.count1) {
        while (l-- != 0) {
          var temp;
          temp = cod_info.xr[j];
          j++;
          noise += temp * temp;
          temp = cod_info.xr[j];
          j++;
          noise += temp * temp;
        }
      } else if (j > cod_info.big_values) {
        var ix01 = new_float(2);
        ix01[0] = 0;
        ix01[1] = step;
        while (l-- != 0) {
          var temp;
          temp = Math.abs(cod_info.xr[j]) - ix01[ix[j]];
          j++;
          noise += temp * temp;
          temp = Math.abs(cod_info.xr[j]) - ix01[ix[j]];
          j++;
          noise += temp * temp;
        }
      } else {
        while (l-- != 0) {
          var temp;
          temp = Math.abs(cod_info.xr[j]) - pow43[ix[j]] * step;
          j++;
          noise += temp * temp;
          temp = Math.abs(cod_info.xr[j]) - pow43[ix[j]] * step;
          j++;
          noise += temp * temp;
        }
      }
      startline.s = j;
      return noise;
    };
    this.calc_noise = function(cod_info, l3_xmin, distort, res, prev_noise) {
      var distortPos = 0;
      var l3_xminPos = 0;
      var sfb, l, over = 0;
      var over_noise_db = 0;
      var tot_noise_db = 0;
      var max_noise = -20;
      var j = 0;
      var scalefac = cod_info.scalefac;
      var scalefacPos = 0;
      res.over_SSD = 0;
      for (sfb = 0; sfb < cod_info.psymax; sfb++) {
        var s = cod_info.global_gain - (scalefac[scalefacPos++] + (cod_info.preflag != 0 ? pretab[sfb] : 0) << cod_info.scalefac_scale + 1) - cod_info.subblock_gain[cod_info.window[sfb]] * 8;
        var noise = 0;
        if (prev_noise != null && prev_noise.step[sfb] == s) {
          noise = prev_noise.noise[sfb];
          j += cod_info.width[sfb];
          distort[distortPos++] = noise / l3_xmin[l3_xminPos++];
          noise = prev_noise.noise_log[sfb];
        } else {
          var step = POW20(s);
          l = cod_info.width[sfb] >> 1;
          if (j + cod_info.width[sfb] > cod_info.max_nonzero_coeff) {
            var usefullsize;
            usefullsize = cod_info.max_nonzero_coeff - j + 1;
            if (usefullsize > 0)
              l = usefullsize >> 1;
            else
              l = 0;
          }
          var sl = new StartLine(j);
          noise = this.calc_noise_core(cod_info, sl, l, step);
          j = sl.s;
          if (prev_noise != null) {
            prev_noise.step[sfb] = s;
            prev_noise.noise[sfb] = noise;
          }
          noise = distort[distortPos++] = noise / l3_xmin[l3_xminPos++];
          noise = Util.FAST_LOG10(Math.max(noise, 1e-20));
          if (prev_noise != null) {
            prev_noise.noise_log[sfb] = noise;
          }
        }
        if (prev_noise != null) {
          prev_noise.global_gain = cod_info.global_gain;
        }
        tot_noise_db += noise;
        if (noise > 0) {
          var tmp;
          tmp = Math.max(0 | noise * 10 + 0.5, 1);
          res.over_SSD += tmp * tmp;
          over++;
          over_noise_db += noise;
        }
        max_noise = Math.max(max_noise, noise);
      }
      res.over_count = over;
      res.tot_noise = tot_noise_db;
      res.over_noise = over_noise_db;
      res.max_noise = max_noise;
      return over;
    };
    this.set_pinfo = function(gfp, cod_info, ratio, gr, ch) {
      var gfc = gfp.internal_flags;
      var sfb, sfb2;
      var l;
      var en0, en1;
      var ifqstep = cod_info.scalefac_scale == 0 ? 0.5 : 1;
      var scalefac = cod_info.scalefac;
      var l3_xmin = new_float(L3Side.SFBMAX);
      var xfsf = new_float(L3Side.SFBMAX);
      var noise = new CalcNoiseResult();
      calc_xmin(gfp, ratio, cod_info, l3_xmin);
      calc_noise(cod_info, l3_xmin, xfsf, noise, null);
      var j = 0;
      sfb2 = cod_info.sfb_lmax;
      if (cod_info.block_type != Encoder.SHORT_TYPE && 0 == cod_info.mixed_block_flag)
        sfb2 = 22;
      for (sfb = 0; sfb < sfb2; sfb++) {
        var start = gfc.scalefac_band.l[sfb];
        var end = gfc.scalefac_band.l[sfb + 1];
        var bw = end - start;
        for (en0 = 0; j < end; j++)
          en0 += cod_info.xr[j] * cod_info.xr[j];
        en0 /= bw;
        en1 = 1e15;
        gfc.pinfo.en[gr][ch][sfb] = en1 * en0;
        gfc.pinfo.xfsf[gr][ch][sfb] = en1 * l3_xmin[sfb] * xfsf[sfb] / bw;
        if (ratio.en.l[sfb] > 0 && !gfp.ATHonly)
          en0 = en0 / ratio.en.l[sfb];
        else
          en0 = 0;
        gfc.pinfo.thr[gr][ch][sfb] = en1 * Math.max(en0 * ratio.thm.l[sfb], gfc.ATH.l[sfb]);
        gfc.pinfo.LAMEsfb[gr][ch][sfb] = 0;
        if (cod_info.preflag != 0 && sfb >= 11)
          gfc.pinfo.LAMEsfb[gr][ch][sfb] = -ifqstep * pretab[sfb];
        if (sfb < Encoder.SBPSY_l) {
          gfc.pinfo.LAMEsfb[gr][ch][sfb] -= ifqstep * scalefac[sfb];
        }
      }
      if (cod_info.block_type == Encoder.SHORT_TYPE) {
        sfb2 = sfb;
        for (sfb = cod_info.sfb_smin; sfb < Encoder.SBMAX_s; sfb++) {
          var start = gfc.scalefac_band.s[sfb];
          var end = gfc.scalefac_band.s[sfb + 1];
          var bw = end - start;
          for (var i = 0; i < 3; i++) {
            for (en0 = 0, l = start; l < end; l++) {
              en0 += cod_info.xr[j] * cod_info.xr[j];
              j++;
            }
            en0 = Math.max(en0 / bw, 1e-20);
            en1 = 1e15;
            gfc.pinfo.en_s[gr][ch][3 * sfb + i] = en1 * en0;
            gfc.pinfo.xfsf_s[gr][ch][3 * sfb + i] = en1 * l3_xmin[sfb2] * xfsf[sfb2] / bw;
            if (ratio.en.s[sfb][i] > 0)
              en0 = en0 / ratio.en.s[sfb][i];
            else
              en0 = 0;
            if (gfp.ATHonly || gfp.ATHshort)
              en0 = 0;
            gfc.pinfo.thr_s[gr][ch][3 * sfb + i] = en1 * Math.max(
              en0 * ratio.thm.s[sfb][i],
              gfc.ATH.s[sfb]
            );
            gfc.pinfo.LAMEsfb_s[gr][ch][3 * sfb + i] = -2 * cod_info.subblock_gain[i];
            if (sfb < Encoder.SBPSY_s) {
              gfc.pinfo.LAMEsfb_s[gr][ch][3 * sfb + i] -= ifqstep * scalefac[sfb2];
            }
            sfb2++;
          }
        }
      }
      gfc.pinfo.LAMEqss[gr][ch] = cod_info.global_gain;
      gfc.pinfo.LAMEmainbits[gr][ch] = cod_info.part2_3_length + cod_info.part2_length;
      gfc.pinfo.LAMEsfbits[gr][ch] = cod_info.part2_length;
      gfc.pinfo.over[gr][ch] = noise.over_count;
      gfc.pinfo.max_noise[gr][ch] = noise.max_noise * 10;
      gfc.pinfo.over_noise[gr][ch] = noise.over_noise * 10;
      gfc.pinfo.tot_noise[gr][ch] = noise.tot_noise * 10;
      gfc.pinfo.over_SSD[gr][ch] = noise.over_SSD;
    };
    function set_frame_pinfo(gfp, ratio) {
      var gfc = gfp.internal_flags;
      gfc.masking_lower = 1;
      for (var gr = 0; gr < gfc.mode_gr; gr++) {
        for (var ch = 0; ch < gfc.channels_out; ch++) {
          var cod_info = gfc.l3_side.tt[gr][ch];
          var scalefac_sav = new_int(L3Side.SFBMAX);
          System.arraycopy(
            cod_info.scalefac,
            0,
            scalefac_sav,
            0,
            scalefac_sav.length
          );
          if (gr == 1) {
            var sfb;
            for (sfb = 0; sfb < cod_info.sfb_lmax; sfb++) {
              if (cod_info.scalefac[sfb] < 0)
                cod_info.scalefac[sfb] = gfc.l3_side.tt[0][ch].scalefac[sfb];
            }
          }
          set_pinfo(gfp, cod_info, ratio[gr][ch], gr, ch);
          System.arraycopy(
            scalefac_sav,
            0,
            cod_info.scalefac,
            0,
            scalefac_sav.length
          );
        }
      }
    }
  }
  function CalcNoiseData() {
    this.global_gain = 0;
    this.sfb_count1 = 0;
    this.step = new_int(39);
    this.noise = new_float(39);
    this.noise_log = new_float(39);
  }
  function GrInfo() {
    this.xr = new_float(576);
    this.l3_enc = new_int(576);
    this.scalefac = new_int(L3Side.SFBMAX);
    this.xrpow_max = 0;
    this.part2_3_length = 0;
    this.big_values = 0;
    this.count1 = 0;
    this.global_gain = 0;
    this.scalefac_compress = 0;
    this.block_type = 0;
    this.mixed_block_flag = 0;
    this.table_select = new_int(3);
    this.subblock_gain = new_int(3 + 1);
    this.region0_count = 0;
    this.region1_count = 0;
    this.preflag = 0;
    this.scalefac_scale = 0;
    this.count1table_select = 0;
    this.part2_length = 0;
    this.sfb_lmax = 0;
    this.sfb_smin = 0;
    this.psy_lmax = 0;
    this.sfbmax = 0;
    this.psymax = 0;
    this.sfbdivide = 0;
    this.width = new_int(L3Side.SFBMAX);
    this.window = new_int(L3Side.SFBMAX);
    this.count1bits = 0;
    this.sfb_partition_table = null;
    this.slen = new_int(4);
    this.max_nonzero_coeff = 0;
    var self = this;
    function clone_int(array) {
      return new Int32Array(array);
    }
    function clone_float(array) {
      return new Float32Array(array);
    }
    this.assign = function(other) {
      self.xr = clone_float(other.xr);
      self.l3_enc = clone_int(other.l3_enc);
      self.scalefac = clone_int(other.scalefac);
      self.xrpow_max = other.xrpow_max;
      self.part2_3_length = other.part2_3_length;
      self.big_values = other.big_values;
      self.count1 = other.count1;
      self.global_gain = other.global_gain;
      self.scalefac_compress = other.scalefac_compress;
      self.block_type = other.block_type;
      self.mixed_block_flag = other.mixed_block_flag;
      self.table_select = clone_int(other.table_select);
      self.subblock_gain = clone_int(other.subblock_gain);
      self.region0_count = other.region0_count;
      self.region1_count = other.region1_count;
      self.preflag = other.preflag;
      self.scalefac_scale = other.scalefac_scale;
      self.count1table_select = other.count1table_select;
      self.part2_length = other.part2_length;
      self.sfb_lmax = other.sfb_lmax;
      self.sfb_smin = other.sfb_smin;
      self.psy_lmax = other.psy_lmax;
      self.sfbmax = other.sfbmax;
      self.psymax = other.psymax;
      self.sfbdivide = other.sfbdivide;
      self.width = clone_int(other.width);
      self.window = clone_int(other.window);
      self.count1bits = other.count1bits;
      self.sfb_partition_table = other.sfb_partition_table.slice(0);
      self.slen = clone_int(other.slen);
      self.max_nonzero_coeff = other.max_nonzero_coeff;
    };
  }
  var L3Side = {};
  L3Side.SFBMAX = Encoder.SBMAX_s * 3;
  function Quantize() {
    var bs;
    this.rv = null;
    var rv;
    this.qupvt = null;
    var qupvt;
    var vbr = new VBRQuantize();
    var tk;
    this.setModules = function(_bs, _rv, _qupvt, _tk) {
      bs = _bs;
      rv = _rv;
      this.rv = _rv;
      qupvt = _qupvt;
      this.qupvt = _qupvt;
      tk = _tk;
      vbr.setModules(qupvt, tk);
    };
    this.ms_convert = function(l3_side, gr) {
      for (var i = 0; i < 576; ++i) {
        var l = l3_side.tt[gr][0].xr[i];
        var r = l3_side.tt[gr][1].xr[i];
        l3_side.tt[gr][0].xr[i] = (l + r) * (Util.SQRT2 * 0.5);
        l3_side.tt[gr][1].xr[i] = (l - r) * (Util.SQRT2 * 0.5);
      }
    };
    function init_xrpow_core(cod_info, xrpow, upper, sum) {
      sum = 0;
      for (var i = 0; i <= upper; ++i) {
        var tmp = Math.abs(cod_info.xr[i]);
        sum += tmp;
        xrpow[i] = Math.sqrt(tmp * Math.sqrt(tmp));
        if (xrpow[i] > cod_info.xrpow_max)
          cod_info.xrpow_max = xrpow[i];
      }
      return sum;
    }
    this.init_xrpow = function(gfc, cod_info, xrpow) {
      var sum = 0;
      var upper = 0 | cod_info.max_nonzero_coeff;
      cod_info.xrpow_max = 0;
      Arrays.fill(xrpow, upper, 576, 0);
      sum = init_xrpow_core(cod_info, xrpow, upper, sum);
      if (sum > 1e-20) {
        var j = 0;
        if ((gfc.substep_shaping & 2) != 0)
          j = 1;
        for (var i = 0; i < cod_info.psymax; i++)
          gfc.pseudohalf[i] = j;
        return true;
      }
      Arrays.fill(cod_info.l3_enc, 0, 576, 0);
      return false;
    };
    function psfb21_analogsilence(gfc, cod_info) {
      var ath = gfc.ATH;
      var xr = cod_info.xr;
      if (cod_info.block_type != Encoder.SHORT_TYPE) {
        var stop = false;
        for (var gsfb = Encoder.PSFB21 - 1; gsfb >= 0 && !stop; gsfb--) {
          var start = gfc.scalefac_band.psfb21[gsfb];
          var end = gfc.scalefac_band.psfb21[gsfb + 1];
          var ath21 = qupvt.athAdjust(
            ath.adjust,
            ath.psfb21[gsfb],
            ath.floor
          );
          if (gfc.nsPsy.longfact[21] > 1e-12)
            ath21 *= gfc.nsPsy.longfact[21];
          for (var j = end - 1; j >= start; j--) {
            if (Math.abs(xr[j]) < ath21)
              xr[j] = 0;
            else {
              stop = true;
              break;
            }
          }
        }
      } else {
        for (var block = 0; block < 3; block++) {
          var stop = false;
          for (var gsfb = Encoder.PSFB12 - 1; gsfb >= 0 && !stop; gsfb--) {
            var start = gfc.scalefac_band.s[12] * 3 + (gfc.scalefac_band.s[13] - gfc.scalefac_band.s[12]) * block + (gfc.scalefac_band.psfb12[gsfb] - gfc.scalefac_band.psfb12[0]);
            var end = start + (gfc.scalefac_band.psfb12[gsfb + 1] - gfc.scalefac_band.psfb12[gsfb]);
            var ath12 = qupvt.athAdjust(
              ath.adjust,
              ath.psfb12[gsfb],
              ath.floor
            );
            if (gfc.nsPsy.shortfact[12] > 1e-12)
              ath12 *= gfc.nsPsy.shortfact[12];
            for (var j = end - 1; j >= start; j--) {
              if (Math.abs(xr[j]) < ath12)
                xr[j] = 0;
              else {
                stop = true;
                break;
              }
            }
          }
        }
      }
    }
    this.init_outer_loop = function(gfc, cod_info) {
      cod_info.part2_3_length = 0;
      cod_info.big_values = 0;
      cod_info.count1 = 0;
      cod_info.global_gain = 210;
      cod_info.scalefac_compress = 0;
      cod_info.table_select[0] = 0;
      cod_info.table_select[1] = 0;
      cod_info.table_select[2] = 0;
      cod_info.subblock_gain[0] = 0;
      cod_info.subblock_gain[1] = 0;
      cod_info.subblock_gain[2] = 0;
      cod_info.subblock_gain[3] = 0;
      cod_info.region0_count = 0;
      cod_info.region1_count = 0;
      cod_info.preflag = 0;
      cod_info.scalefac_scale = 0;
      cod_info.count1table_select = 0;
      cod_info.part2_length = 0;
      cod_info.sfb_lmax = Encoder.SBPSY_l;
      cod_info.sfb_smin = Encoder.SBPSY_s;
      cod_info.psy_lmax = gfc.sfb21_extra ? Encoder.SBMAX_l : Encoder.SBPSY_l;
      cod_info.psymax = cod_info.psy_lmax;
      cod_info.sfbmax = cod_info.sfb_lmax;
      cod_info.sfbdivide = 11;
      for (var sfb = 0; sfb < Encoder.SBMAX_l; sfb++) {
        cod_info.width[sfb] = gfc.scalefac_band.l[sfb + 1] - gfc.scalefac_band.l[sfb];
        cod_info.window[sfb] = 3;
      }
      if (cod_info.block_type == Encoder.SHORT_TYPE) {
        var ixwork = new_float(576);
        cod_info.sfb_smin = 0;
        cod_info.sfb_lmax = 0;
        if (cod_info.mixed_block_flag != 0) {
          cod_info.sfb_smin = 3;
          cod_info.sfb_lmax = gfc.mode_gr * 2 + 4;
        }
        cod_info.psymax = cod_info.sfb_lmax + 3 * ((gfc.sfb21_extra ? Encoder.SBMAX_s : Encoder.SBPSY_s) - cod_info.sfb_smin);
        cod_info.sfbmax = cod_info.sfb_lmax + 3 * (Encoder.SBPSY_s - cod_info.sfb_smin);
        cod_info.sfbdivide = cod_info.sfbmax - 18;
        cod_info.psy_lmax = cod_info.sfb_lmax;
        var ix = gfc.scalefac_band.l[cod_info.sfb_lmax];
        System.arraycopy(cod_info.xr, 0, ixwork, 0, 576);
        for (var sfb = cod_info.sfb_smin; sfb < Encoder.SBMAX_s; sfb++) {
          var start = gfc.scalefac_band.s[sfb];
          var end = gfc.scalefac_band.s[sfb + 1];
          for (var window = 0; window < 3; window++) {
            for (var l = start; l < end; l++) {
              cod_info.xr[ix++] = ixwork[3 * l + window];
            }
          }
        }
        var j = cod_info.sfb_lmax;
        for (var sfb = cod_info.sfb_smin; sfb < Encoder.SBMAX_s; sfb++) {
          cod_info.width[j] = cod_info.width[j + 1] = cod_info.width[j + 2] = gfc.scalefac_band.s[sfb + 1] - gfc.scalefac_band.s[sfb];
          cod_info.window[j] = 0;
          cod_info.window[j + 1] = 1;
          cod_info.window[j + 2] = 2;
          j += 3;
        }
      }
      cod_info.count1bits = 0;
      cod_info.sfb_partition_table = qupvt.nr_of_sfb_block[0][0];
      cod_info.slen[0] = 0;
      cod_info.slen[1] = 0;
      cod_info.slen[2] = 0;
      cod_info.slen[3] = 0;
      cod_info.max_nonzero_coeff = 575;
      Arrays.fill(cod_info.scalefac, 0);
      psfb21_analogsilence(gfc, cod_info);
    };
    function BinSearchDirection(ordinal) {
      this.ordinal = ordinal;
    }
    BinSearchDirection.BINSEARCH_NONE = new BinSearchDirection(0);
    BinSearchDirection.BINSEARCH_UP = new BinSearchDirection(1);
    BinSearchDirection.BINSEARCH_DOWN = new BinSearchDirection(2);
    function bin_search_StepSize(gfc, cod_info, desired_rate, ch, xrpow) {
      var nBits;
      var CurrentStep = gfc.CurrentStep[ch];
      var flagGoneOver = false;
      var start = gfc.OldValue[ch];
      var Direction = BinSearchDirection.BINSEARCH_NONE;
      cod_info.global_gain = start;
      desired_rate -= cod_info.part2_length;
      for (; ; ) {
        var step;
        nBits = tk.count_bits(gfc, xrpow, cod_info, null);
        if (CurrentStep == 1 || nBits == desired_rate)
          break;
        if (nBits > desired_rate) {
          if (Direction == BinSearchDirection.BINSEARCH_DOWN)
            flagGoneOver = true;
          if (flagGoneOver)
            CurrentStep /= 2;
          Direction = BinSearchDirection.BINSEARCH_UP;
          step = CurrentStep;
        } else {
          if (Direction == BinSearchDirection.BINSEARCH_UP)
            flagGoneOver = true;
          if (flagGoneOver)
            CurrentStep /= 2;
          Direction = BinSearchDirection.BINSEARCH_DOWN;
          step = -CurrentStep;
        }
        cod_info.global_gain += step;
        if (cod_info.global_gain < 0) {
          cod_info.global_gain = 0;
          flagGoneOver = true;
        }
        if (cod_info.global_gain > 255) {
          cod_info.global_gain = 255;
          flagGoneOver = true;
        }
      }
      while (nBits > desired_rate && cod_info.global_gain < 255) {
        cod_info.global_gain++;
        nBits = tk.count_bits(gfc, xrpow, cod_info, null);
      }
      gfc.CurrentStep[ch] = start - cod_info.global_gain >= 4 ? 4 : 2;
      gfc.OldValue[ch] = cod_info.global_gain;
      cod_info.part2_3_length = nBits;
      return nBits;
    }
    this.trancate_smallspectrums = function(gfc, gi, l3_xmin, work) {
      var distort = new_float(L3Side.SFBMAX);
      if (0 == (gfc.substep_shaping & 4) && gi.block_type == Encoder.SHORT_TYPE || (gfc.substep_shaping & 128) != 0)
        return;
      qupvt.calc_noise(gi, l3_xmin, distort, new CalcNoiseResult(), null);
      for (var j = 0; j < 576; j++) {
        var xr = 0;
        if (gi.l3_enc[j] != 0)
          xr = Math.abs(gi.xr[j]);
        work[j] = xr;
      }
      var j = 0;
      var sfb = 8;
      if (gi.block_type == Encoder.SHORT_TYPE)
        sfb = 6;
      do {
        var allowedNoise, trancateThreshold;
        var nsame, start;
        var width = gi.width[sfb];
        j += width;
        if (distort[sfb] >= 1)
          continue;
        Arrays.sort(work, j - width, width);
        if (BitStream.EQ(work[j - 1], 0))
          continue;
        allowedNoise = (1 - distort[sfb]) * l3_xmin[sfb];
        trancateThreshold = 0;
        start = 0;
        do {
          var noise;
          for (nsame = 1; start + nsame < width; nsame++)
            if (BitStream.NEQ(work[start + j - width], work[start + j + nsame - width]))
              break;
          noise = work[start + j - width] * work[start + j - width] * nsame;
          if (allowedNoise < noise) {
            if (start != 0)
              trancateThreshold = work[start + j - width - 1];
            break;
          }
          allowedNoise -= noise;
          start += nsame;
        } while (start < width);
        if (BitStream.EQ(trancateThreshold, 0))
          continue;
        do {
          if (Math.abs(gi.xr[j - width]) <= trancateThreshold)
            gi.l3_enc[j - width] = 0;
        } while (--width > 0);
      } while (++sfb < gi.psymax);
      gi.part2_3_length = tk.noquant_count_bits(gfc, gi, null);
    };
    function loop_break(cod_info) {
      for (var sfb = 0; sfb < cod_info.sfbmax; sfb++)
        if (cod_info.scalefac[sfb] + cod_info.subblock_gain[cod_info.window[sfb]] == 0)
          return false;
      return true;
    }
    function penalties(noise) {
      return Util.FAST_LOG10(0.368 + 0.632 * noise * noise * noise);
    }
    function get_klemm_noise(distort, gi) {
      var klemm_noise = 1e-37;
      for (var sfb = 0; sfb < gi.psymax; sfb++)
        klemm_noise += penalties(distort[sfb]);
      return Math.max(1e-20, klemm_noise);
    }
    function quant_compare(quant_comp, best, calc, gi, distort) {
      var better;
      switch (quant_comp) {
        default:
        case 9: {
          if (best.over_count > 0) {
            better = calc.over_SSD <= best.over_SSD;
            if (calc.over_SSD == best.over_SSD)
              better = calc.bits < best.bits;
          } else {
            better = calc.max_noise < 0 && calc.max_noise * 10 + calc.bits <= best.max_noise * 10 + best.bits;
          }
          break;
        }
        case 0:
          better = calc.over_count < best.over_count || calc.over_count == best.over_count && calc.over_noise < best.over_noise || calc.over_count == best.over_count && BitStream.EQ(calc.over_noise, best.over_noise) && calc.tot_noise < best.tot_noise;
          break;
        case 8:
          calc.max_noise = get_klemm_noise(distort, gi);
        //$FALL-THROUGH$
        case 1:
          better = calc.max_noise < best.max_noise;
          break;
        case 2:
          better = calc.tot_noise < best.tot_noise;
          break;
        case 3:
          better = calc.tot_noise < best.tot_noise && calc.max_noise < best.max_noise;
          break;
        case 4:
          better = calc.max_noise <= 0 && best.max_noise > 0.2 || calc.max_noise <= 0 && best.max_noise < 0 && best.max_noise > calc.max_noise - 0.2 && calc.tot_noise < best.tot_noise || calc.max_noise <= 0 && best.max_noise > 0 && best.max_noise > calc.max_noise - 0.2 && calc.tot_noise < best.tot_noise + best.over_noise || calc.max_noise > 0 && best.max_noise > -0.05 && best.max_noise > calc.max_noise - 0.1 && calc.tot_noise + calc.over_noise < best.tot_noise + best.over_noise || calc.max_noise > 0 && best.max_noise > -0.1 && best.max_noise > calc.max_noise - 0.15 && calc.tot_noise + calc.over_noise + calc.over_noise < best.tot_noise + best.over_noise + best.over_noise;
          break;
        case 5:
          better = calc.over_noise < best.over_noise || BitStream.EQ(calc.over_noise, best.over_noise) && calc.tot_noise < best.tot_noise;
          break;
        case 6:
          better = calc.over_noise < best.over_noise || BitStream.EQ(calc.over_noise, best.over_noise) && (calc.max_noise < best.max_noise || BitStream.EQ(calc.max_noise, best.max_noise) && calc.tot_noise <= best.tot_noise);
          break;
        case 7:
          better = calc.over_count < best.over_count || calc.over_noise < best.over_noise;
          break;
      }
      if (best.over_count == 0) {
        better = better && calc.bits < best.bits;
      }
      return better;
    }
    function amp_scalefac_bands(gfp, cod_info, distort, xrpow, bRefine) {
      var gfc = gfp.internal_flags;
      var ifqstep34;
      if (cod_info.scalefac_scale == 0) {
        ifqstep34 = 1.2968395546510096;
      } else {
        ifqstep34 = 1.6817928305074292;
      }
      var trigger = 0;
      for (var sfb = 0; sfb < cod_info.sfbmax; sfb++) {
        if (trigger < distort[sfb])
          trigger = distort[sfb];
      }
      var noise_shaping_amp = gfc.noise_shaping_amp;
      if (noise_shaping_amp == 3) {
        if (bRefine)
          noise_shaping_amp = 2;
        else
          noise_shaping_amp = 1;
      }
      switch (noise_shaping_amp) {
        case 2:
          break;
        case 1:
          if (trigger > 1)
            trigger = Math.pow(trigger, 0.5);
          else
            trigger *= 0.95;
          break;
        case 0:
        default:
          if (trigger > 1)
            trigger = 1;
          else
            trigger *= 0.95;
          break;
      }
      var j = 0;
      for (var sfb = 0; sfb < cod_info.sfbmax; sfb++) {
        var width = cod_info.width[sfb];
        var l;
        j += width;
        if (distort[sfb] < trigger)
          continue;
        if ((gfc.substep_shaping & 2) != 0) {
          gfc.pseudohalf[sfb] = 0 == gfc.pseudohalf[sfb] ? 1 : 0;
          if (0 == gfc.pseudohalf[sfb] && gfc.noise_shaping_amp == 2)
            return;
        }
        cod_info.scalefac[sfb]++;
        for (l = -width; l < 0; l++) {
          xrpow[j + l] *= ifqstep34;
          if (xrpow[j + l] > cod_info.xrpow_max)
            cod_info.xrpow_max = xrpow[j + l];
        }
        if (gfc.noise_shaping_amp == 2)
          return;
      }
    }
    function inc_scalefac_scale(cod_info, xrpow) {
      var ifqstep34 = 1.2968395546510096;
      var j = 0;
      for (var sfb = 0; sfb < cod_info.sfbmax; sfb++) {
        var width = cod_info.width[sfb];
        var s = cod_info.scalefac[sfb];
        if (cod_info.preflag != 0)
          s += qupvt.pretab[sfb];
        j += width;
        if ((s & 1) != 0) {
          s++;
          for (var l = -width; l < 0; l++) {
            xrpow[j + l] *= ifqstep34;
            if (xrpow[j + l] > cod_info.xrpow_max)
              cod_info.xrpow_max = xrpow[j + l];
          }
        }
        cod_info.scalefac[sfb] = s >> 1;
      }
      cod_info.preflag = 0;
      cod_info.scalefac_scale = 1;
    }
    function inc_subblock_gain(gfc, cod_info, xrpow) {
      var sfb;
      var scalefac = cod_info.scalefac;
      for (sfb = 0; sfb < cod_info.sfb_lmax; sfb++) {
        if (scalefac[sfb] >= 16)
          return true;
      }
      for (var window = 0; window < 3; window++) {
        var s1 = 0;
        var s2 = 0;
        for (sfb = cod_info.sfb_lmax + window; sfb < cod_info.sfbdivide; sfb += 3) {
          if (s1 < scalefac[sfb])
            s1 = scalefac[sfb];
        }
        for (; sfb < cod_info.sfbmax; sfb += 3) {
          if (s2 < scalefac[sfb])
            s2 = scalefac[sfb];
        }
        if (s1 < 16 && s2 < 8)
          continue;
        if (cod_info.subblock_gain[window] >= 7)
          return true;
        cod_info.subblock_gain[window]++;
        var j = gfc.scalefac_band.l[cod_info.sfb_lmax];
        for (sfb = cod_info.sfb_lmax + window; sfb < cod_info.sfbmax; sfb += 3) {
          var amp;
          var width = cod_info.width[sfb];
          var s = scalefac[sfb];
          s = s - (4 >> cod_info.scalefac_scale);
          if (s >= 0) {
            scalefac[sfb] = s;
            j += width * 3;
            continue;
          }
          scalefac[sfb] = 0;
          {
            var gain = 210 + (s << cod_info.scalefac_scale + 1);
            amp = qupvt.IPOW20(gain);
          }
          j += width * (window + 1);
          for (var l = -width; l < 0; l++) {
            xrpow[j + l] *= amp;
            if (xrpow[j + l] > cod_info.xrpow_max)
              cod_info.xrpow_max = xrpow[j + l];
          }
          j += width * (3 - window - 1);
        }
        {
          var amp = qupvt.IPOW20(202);
          j += cod_info.width[sfb] * (window + 1);
          for (var l = -cod_info.width[sfb]; l < 0; l++) {
            xrpow[j + l] *= amp;
            if (xrpow[j + l] > cod_info.xrpow_max)
              cod_info.xrpow_max = xrpow[j + l];
          }
        }
      }
      return false;
    }
    function balance_noise(gfp, cod_info, distort, xrpow, bRefine) {
      var gfc = gfp.internal_flags;
      amp_scalefac_bands(gfp, cod_info, distort, xrpow, bRefine);
      var status = loop_break(cod_info);
      if (status)
        return false;
      if (gfc.mode_gr == 2)
        status = tk.scale_bitcount(cod_info);
      else
        status = tk.scale_bitcount_lsf(gfc, cod_info);
      if (!status)
        return true;
      if (gfc.noise_shaping > 1) {
        Arrays.fill(gfc.pseudohalf, 0);
        if (0 == cod_info.scalefac_scale) {
          inc_scalefac_scale(cod_info, xrpow);
          status = false;
        } else {
          if (cod_info.block_type == Encoder.SHORT_TYPE && gfc.subblock_gain > 0) {
            status = inc_subblock_gain(gfc, cod_info, xrpow) || loop_break(cod_info);
          }
        }
      }
      if (!status) {
        if (gfc.mode_gr == 2)
          status = tk.scale_bitcount(cod_info);
        else
          status = tk.scale_bitcount_lsf(gfc, cod_info);
      }
      return !status;
    }
    this.outer_loop = function(gfp, cod_info, l3_xmin, xrpow, ch, targ_bits) {
      var gfc = gfp.internal_flags;
      var cod_info_w = new GrInfo();
      var save_xrpow = new_float(576);
      var distort = new_float(L3Side.SFBMAX);
      var best_noise_info = new CalcNoiseResult();
      var better;
      var prev_noise = new CalcNoiseData();
      var best_part2_3_length = 9999999;
      var bEndOfSearch = false;
      var bRefine = false;
      var best_ggain_pass1 = 0;
      bin_search_StepSize(gfc, cod_info, targ_bits, ch, xrpow);
      if (0 == gfc.noise_shaping)
        return 100;
      qupvt.calc_noise(
        cod_info,
        l3_xmin,
        distort,
        best_noise_info,
        prev_noise
      );
      best_noise_info.bits = cod_info.part2_3_length;
      cod_info_w.assign(cod_info);
      var age = 0;
      System.arraycopy(xrpow, 0, save_xrpow, 0, 576);
      while (!bEndOfSearch) {
        do {
          var noise_info = new CalcNoiseResult();
          var search_limit;
          var maxggain = 255;
          if ((gfc.substep_shaping & 2) != 0) {
            search_limit = 20;
          } else {
            search_limit = 3;
          }
          if (gfc.sfb21_extra) {
            if (distort[cod_info_w.sfbmax] > 1)
              break;
            if (cod_info_w.block_type == Encoder.SHORT_TYPE && (distort[cod_info_w.sfbmax + 1] > 1 || distort[cod_info_w.sfbmax + 2] > 1))
              break;
          }
          if (!balance_noise(gfp, cod_info_w, distort, xrpow, bRefine))
            break;
          if (cod_info_w.scalefac_scale != 0)
            maxggain = 254;
          var huff_bits = targ_bits - cod_info_w.part2_length;
          if (huff_bits <= 0)
            break;
          while ((cod_info_w.part2_3_length = tk.count_bits(
            gfc,
            xrpow,
            cod_info_w,
            prev_noise
          )) > huff_bits && cod_info_w.global_gain <= maxggain)
            cod_info_w.global_gain++;
          if (cod_info_w.global_gain > maxggain)
            break;
          if (best_noise_info.over_count == 0) {
            while ((cod_info_w.part2_3_length = tk.count_bits(
              gfc,
              xrpow,
              cod_info_w,
              prev_noise
            )) > best_part2_3_length && cod_info_w.global_gain <= maxggain)
              cod_info_w.global_gain++;
            if (cod_info_w.global_gain > maxggain)
              break;
          }
          qupvt.calc_noise(
            cod_info_w,
            l3_xmin,
            distort,
            noise_info,
            prev_noise
          );
          noise_info.bits = cod_info_w.part2_3_length;
          if (cod_info.block_type != Encoder.SHORT_TYPE) {
            better = gfp.quant_comp;
          } else
            better = gfp.quant_comp_short;
          better = quant_compare(
            better,
            best_noise_info,
            noise_info,
            cod_info_w,
            distort
          ) ? 1 : 0;
          if (better != 0) {
            best_part2_3_length = cod_info.part2_3_length;
            best_noise_info = noise_info;
            cod_info.assign(cod_info_w);
            age = 0;
            System.arraycopy(xrpow, 0, save_xrpow, 0, 576);
          } else {
            if (gfc.full_outer_loop == 0) {
              if (++age > search_limit && best_noise_info.over_count == 0)
                break;
              if (gfc.noise_shaping_amp == 3 && bRefine && age > 30)
                break;
              if (gfc.noise_shaping_amp == 3 && bRefine && cod_info_w.global_gain - best_ggain_pass1 > 15)
                break;
            }
          }
        } while (cod_info_w.global_gain + cod_info_w.scalefac_scale < 255);
        if (gfc.noise_shaping_amp == 3) {
          if (!bRefine) {
            cod_info_w.assign(cod_info);
            System.arraycopy(save_xrpow, 0, xrpow, 0, 576);
            age = 0;
            best_ggain_pass1 = cod_info_w.global_gain;
            bRefine = true;
          } else {
            bEndOfSearch = true;
          }
        } else {
          bEndOfSearch = true;
        }
      }
      if (gfp.VBR == VbrMode.vbr_rh || gfp.VBR == VbrMode.vbr_mtrh)
        System.arraycopy(save_xrpow, 0, xrpow, 0, 576);
      else if ((gfc.substep_shaping & 1) != 0)
        trancate_smallspectrums(gfc, cod_info, l3_xmin, xrpow);
      return best_noise_info.over_count;
    };
    this.iteration_finish_one = function(gfc, gr, ch) {
      var l3_side = gfc.l3_side;
      var cod_info = l3_side.tt[gr][ch];
      tk.best_scalefac_store(gfc, gr, ch, l3_side);
      if (gfc.use_best_huffman == 1)
        tk.best_huffman_divide(gfc, cod_info);
      rv.ResvAdjust(gfc, cod_info);
    };
    this.VBR_encode_granule = function(gfp, cod_info, l3_xmin, xrpow, ch, min_bits, max_bits) {
      var gfc = gfp.internal_flags;
      var bst_cod_info = new GrInfo();
      var bst_xrpow = new_float(576);
      var Max_bits = max_bits;
      var real_bits = max_bits + 1;
      var this_bits = (max_bits + min_bits) / 2;
      var dbits, over, found = 0;
      var sfb21_extra = gfc.sfb21_extra;
      Arrays.fill(bst_cod_info.l3_enc, 0);
      do {
        if (this_bits > Max_bits - 42)
          gfc.sfb21_extra = false;
        else
          gfc.sfb21_extra = sfb21_extra;
        over = outer_loop(gfp, cod_info, l3_xmin, xrpow, ch, this_bits);
        if (over <= 0) {
          found = 1;
          real_bits = cod_info.part2_3_length;
          bst_cod_info.assign(cod_info);
          System.arraycopy(xrpow, 0, bst_xrpow, 0, 576);
          max_bits = real_bits - 32;
          dbits = max_bits - min_bits;
          this_bits = (max_bits + min_bits) / 2;
        } else {
          min_bits = this_bits + 32;
          dbits = max_bits - min_bits;
          this_bits = (max_bits + min_bits) / 2;
          if (found != 0) {
            found = 2;
            cod_info.assign(bst_cod_info);
            System.arraycopy(bst_xrpow, 0, xrpow, 0, 576);
          }
        }
      } while (dbits > 12);
      gfc.sfb21_extra = sfb21_extra;
      if (found == 2) {
        System.arraycopy(bst_cod_info.l3_enc, 0, cod_info.l3_enc, 0, 576);
      }
    };
    this.get_framebits = function(gfp, frameBits) {
      var gfc = gfp.internal_flags;
      gfc.bitrate_index = gfc.VBR_min_bitrate;
      var bitsPerFrame = bs.getframebits(gfp);
      gfc.bitrate_index = 1;
      bitsPerFrame = bs.getframebits(gfp);
      for (var i = 1; i <= gfc.VBR_max_bitrate; i++) {
        gfc.bitrate_index = i;
        var mb = new MeanBits(bitsPerFrame);
        frameBits[i] = rv.ResvFrameBegin(gfp, mb);
        bitsPerFrame = mb.bits;
      }
    };
    this.VBR_old_prepare = function(gfp, pe, ms_ener_ratio, ratio, l3_xmin, frameBits, min_bits, max_bits, bands) {
      var gfc = gfp.internal_flags;
      var masking_lower_db, adjust = 0;
      var analog_silence = 1;
      var bits = 0;
      gfc.bitrate_index = gfc.VBR_max_bitrate;
      var avg = rv.ResvFrameBegin(gfp, new MeanBits(0)) / gfc.mode_gr;
      get_framebits(gfp, frameBits);
      for (var gr = 0; gr < gfc.mode_gr; gr++) {
        var mxb = qupvt.on_pe(gfp, pe, max_bits[gr], avg, gr, 0);
        if (gfc.mode_ext == Encoder.MPG_MD_MS_LR) {
          ms_convert(gfc.l3_side, gr);
          qupvt.reduce_side(max_bits[gr], ms_ener_ratio[gr], avg, mxb);
        }
        for (var ch = 0; ch < gfc.channels_out; ++ch) {
          var cod_info = gfc.l3_side.tt[gr][ch];
          if (cod_info.block_type != Encoder.SHORT_TYPE) {
            adjust = 1.28 / (1 + Math.exp(3.5 - pe[gr][ch] / 300)) - 0.05;
            masking_lower_db = gfc.PSY.mask_adjust - adjust;
          } else {
            adjust = 2.56 / (1 + Math.exp(3.5 - pe[gr][ch] / 300)) - 0.14;
            masking_lower_db = gfc.PSY.mask_adjust_short - adjust;
          }
          gfc.masking_lower = Math.pow(
            10,
            masking_lower_db * 0.1
          );
          init_outer_loop(gfc, cod_info);
          bands[gr][ch] = qupvt.calc_xmin(
            gfp,
            ratio[gr][ch],
            cod_info,
            l3_xmin[gr][ch]
          );
          if (bands[gr][ch] != 0)
            analog_silence = 0;
          min_bits[gr][ch] = 126;
          bits += max_bits[gr][ch];
        }
      }
      for (var gr = 0; gr < gfc.mode_gr; gr++) {
        for (var ch = 0; ch < gfc.channels_out; ch++) {
          if (bits > frameBits[gfc.VBR_max_bitrate]) {
            max_bits[gr][ch] *= frameBits[gfc.VBR_max_bitrate];
            max_bits[gr][ch] /= bits;
          }
          if (min_bits[gr][ch] > max_bits[gr][ch])
            min_bits[gr][ch] = max_bits[gr][ch];
        }
      }
      return analog_silence;
    };
    this.bitpressure_strategy = function(gfc, l3_xmin, min_bits, max_bits) {
      for (var gr = 0; gr < gfc.mode_gr; gr++) {
        for (var ch = 0; ch < gfc.channels_out; ch++) {
          var gi = gfc.l3_side.tt[gr][ch];
          var pxmin = l3_xmin[gr][ch];
          var pxminPos = 0;
          for (var sfb = 0; sfb < gi.psy_lmax; sfb++)
            pxmin[pxminPos++] *= 1 + 0.029 * sfb * sfb / Encoder.SBMAX_l / Encoder.SBMAX_l;
          if (gi.block_type == Encoder.SHORT_TYPE) {
            for (var sfb = gi.sfb_smin; sfb < Encoder.SBMAX_s; sfb++) {
              pxmin[pxminPos++] *= 1 + 0.029 * sfb * sfb / Encoder.SBMAX_s / Encoder.SBMAX_s;
              pxmin[pxminPos++] *= 1 + 0.029 * sfb * sfb / Encoder.SBMAX_s / Encoder.SBMAX_s;
              pxmin[pxminPos++] *= 1 + 0.029 * sfb * sfb / Encoder.SBMAX_s / Encoder.SBMAX_s;
            }
          }
          max_bits[gr][ch] = 0 | Math.max(
            min_bits[gr][ch],
            0.9 * max_bits[gr][ch]
          );
        }
      }
    };
    this.VBR_new_prepare = function(gfp, pe, ratio, l3_xmin, frameBits, max_bits) {
      var gfc = gfp.internal_flags;
      var analog_silence = 1;
      var avg = 0, bits = 0;
      var maximum_framebits;
      if (!gfp.free_format) {
        gfc.bitrate_index = gfc.VBR_max_bitrate;
        var mb = new MeanBits(avg);
        rv.ResvFrameBegin(gfp, mb);
        avg = mb.bits;
        get_framebits(gfp, frameBits);
        maximum_framebits = frameBits[gfc.VBR_max_bitrate];
      } else {
        gfc.bitrate_index = 0;
        var mb = new MeanBits(avg);
        maximum_framebits = rv.ResvFrameBegin(gfp, mb);
        avg = mb.bits;
        frameBits[0] = maximum_framebits;
      }
      for (var gr = 0; gr < gfc.mode_gr; gr++) {
        qupvt.on_pe(gfp, pe, max_bits[gr], avg, gr, 0);
        if (gfc.mode_ext == Encoder.MPG_MD_MS_LR) {
          ms_convert(gfc.l3_side, gr);
        }
        for (var ch = 0; ch < gfc.channels_out; ++ch) {
          var cod_info = gfc.l3_side.tt[gr][ch];
          gfc.masking_lower = Math.pow(
            10,
            gfc.PSY.mask_adjust * 0.1
          );
          init_outer_loop(gfc, cod_info);
          if (0 != qupvt.calc_xmin(
            gfp,
            ratio[gr][ch],
            cod_info,
            l3_xmin[gr][ch]
          ))
            analog_silence = 0;
          bits += max_bits[gr][ch];
        }
      }
      for (var gr = 0; gr < gfc.mode_gr; gr++) {
        for (var ch = 0; ch < gfc.channels_out; ch++) {
          if (bits > maximum_framebits) {
            max_bits[gr][ch] *= maximum_framebits;
            max_bits[gr][ch] /= bits;
          }
        }
      }
      return analog_silence;
    };
    this.calc_target_bits = function(gfp, pe, ms_ener_ratio, targ_bits, analog_silence_bits, max_frame_bits) {
      var gfc = gfp.internal_flags;
      var l3_side = gfc.l3_side;
      var res_factor;
      var gr, ch, totbits, mean_bits = 0;
      gfc.bitrate_index = gfc.VBR_max_bitrate;
      var mb = new MeanBits(mean_bits);
      max_frame_bits[0] = rv.ResvFrameBegin(gfp, mb);
      mean_bits = mb.bits;
      gfc.bitrate_index = 1;
      mean_bits = bs.getframebits(gfp) - gfc.sideinfo_len * 8;
      analog_silence_bits[0] = mean_bits / (gfc.mode_gr * gfc.channels_out);
      mean_bits = gfp.VBR_mean_bitrate_kbps * gfp.framesize * 1e3;
      if ((gfc.substep_shaping & 1) != 0)
        mean_bits *= 1.09;
      mean_bits /= gfp.out_samplerate;
      mean_bits -= gfc.sideinfo_len * 8;
      mean_bits /= gfc.mode_gr * gfc.channels_out;
      res_factor = 0.93 + 0.07 * (11 - gfp.compression_ratio) / (11 - 5.5);
      if (res_factor < 0.9)
        res_factor = 0.9;
      if (res_factor > 1)
        res_factor = 1;
      for (gr = 0; gr < gfc.mode_gr; gr++) {
        var sum = 0;
        for (ch = 0; ch < gfc.channels_out; ch++) {
          targ_bits[gr][ch] = int(res_factor * mean_bits);
          if (pe[gr][ch] > 700) {
            var add_bits = int((pe[gr][ch] - 700) / 1.4);
            var cod_info = l3_side.tt[gr][ch];
            targ_bits[gr][ch] = int(res_factor * mean_bits);
            if (cod_info.block_type == Encoder.SHORT_TYPE) {
              if (add_bits < mean_bits / 2)
                add_bits = mean_bits / 2;
            }
            if (add_bits > mean_bits * 3 / 2)
              add_bits = mean_bits * 3 / 2;
            else if (add_bits < 0)
              add_bits = 0;
            targ_bits[gr][ch] += add_bits;
          }
          if (targ_bits[gr][ch] > LameInternalFlags.MAX_BITS_PER_CHANNEL) {
            targ_bits[gr][ch] = LameInternalFlags.MAX_BITS_PER_CHANNEL;
          }
          sum += targ_bits[gr][ch];
        }
        if (sum > LameInternalFlags.MAX_BITS_PER_GRANULE) {
          for (ch = 0; ch < gfc.channels_out; ++ch) {
            targ_bits[gr][ch] *= LameInternalFlags.MAX_BITS_PER_GRANULE;
            targ_bits[gr][ch] /= sum;
          }
        }
      }
      if (gfc.mode_ext == Encoder.MPG_MD_MS_LR)
        for (gr = 0; gr < gfc.mode_gr; gr++) {
          qupvt.reduce_side(
            targ_bits[gr],
            ms_ener_ratio[gr],
            mean_bits * gfc.channels_out,
            LameInternalFlags.MAX_BITS_PER_GRANULE
          );
        }
      totbits = 0;
      for (gr = 0; gr < gfc.mode_gr; gr++) {
        for (ch = 0; ch < gfc.channels_out; ch++) {
          if (targ_bits[gr][ch] > LameInternalFlags.MAX_BITS_PER_CHANNEL)
            targ_bits[gr][ch] = LameInternalFlags.MAX_BITS_PER_CHANNEL;
          totbits += targ_bits[gr][ch];
        }
      }
      if (totbits > max_frame_bits[0]) {
        for (gr = 0; gr < gfc.mode_gr; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            targ_bits[gr][ch] *= max_frame_bits[0];
            targ_bits[gr][ch] /= totbits;
          }
        }
      }
    };
  }
  function NewMDCT() {
    var enwindow = [
      -477e-9 * 0.740951125354959 / 2384e-9,
      103951e-9 * 0.740951125354959 / 2384e-9,
      953674e-9 * 0.740951125354959 / 2384e-9,
      2841473e-9 * 0.740951125354959 / 2384e-9,
      0.035758972 * 0.740951125354959 / 2384e-9,
      3401756e-9 * 0.740951125354959 / 2384e-9,
      983715e-9 * 0.740951125354959 / 2384e-9,
      99182e-9 * 0.740951125354959 / 2384e-9,
      /* 15 */
      12398e-9 * 0.740951125354959 / 2384e-9,
      191212e-9 * 0.740951125354959 / 2384e-9,
      2283096e-9 * 0.740951125354959 / 2384e-9,
      0.016994476 * 0.740951125354959 / 2384e-9,
      -0.018756866 * 0.740951125354959 / 2384e-9,
      -2630711e-9 * 0.740951125354959 / 2384e-9,
      -247478e-9 * 0.740951125354959 / 2384e-9,
      -14782e-9 * 0.740951125354959 / 2384e-9,
      0.9063471690191471,
      0.1960342806591213,
      -477e-9 * 0.773010453362737 / 2384e-9,
      105858e-9 * 0.773010453362737 / 2384e-9,
      930786e-9 * 0.773010453362737 / 2384e-9,
      2521515e-9 * 0.773010453362737 / 2384e-9,
      0.035694122 * 0.773010453362737 / 2384e-9,
      3643036e-9 * 0.773010453362737 / 2384e-9,
      991821e-9 * 0.773010453362737 / 2384e-9,
      96321e-9 * 0.773010453362737 / 2384e-9,
      /* 14 */
      11444e-9 * 0.773010453362737 / 2384e-9,
      165462e-9 * 0.773010453362737 / 2384e-9,
      2110004e-9 * 0.773010453362737 / 2384e-9,
      0.016112804 * 0.773010453362737 / 2384e-9,
      -0.019634247 * 0.773010453362737 / 2384e-9,
      -2803326e-9 * 0.773010453362737 / 2384e-9,
      -277042e-9 * 0.773010453362737 / 2384e-9,
      -16689e-9 * 0.773010453362737 / 2384e-9,
      0.8206787908286602,
      0.3901806440322567,
      -477e-9 * 0.803207531480645 / 2384e-9,
      107288e-9 * 0.803207531480645 / 2384e-9,
      902653e-9 * 0.803207531480645 / 2384e-9,
      2174854e-9 * 0.803207531480645 / 2384e-9,
      0.035586357 * 0.803207531480645 / 2384e-9,
      3858566e-9 * 0.803207531480645 / 2384e-9,
      995159e-9 * 0.803207531480645 / 2384e-9,
      9346e-8 * 0.803207531480645 / 2384e-9,
      /* 13 */
      10014e-9 * 0.803207531480645 / 2384e-9,
      14019e-8 * 0.803207531480645 / 2384e-9,
      1937389e-9 * 0.803207531480645 / 2384e-9,
      0.015233517 * 0.803207531480645 / 2384e-9,
      -0.020506859 * 0.803207531480645 / 2384e-9,
      -2974033e-9 * 0.803207531480645 / 2384e-9,
      -30756e-8 * 0.803207531480645 / 2384e-9,
      -1812e-8 * 0.803207531480645 / 2384e-9,
      0.7416505462720353,
      0.5805693545089249,
      -477e-9 * 0.831469612302545 / 2384e-9,
      108242e-9 * 0.831469612302545 / 2384e-9,
      868797e-9 * 0.831469612302545 / 2384e-9,
      1800537e-9 * 0.831469612302545 / 2384e-9,
      0.0354352 * 0.831469612302545 / 2384e-9,
      4049301e-9 * 0.831469612302545 / 2384e-9,
      994205e-9 * 0.831469612302545 / 2384e-9,
      90599e-9 * 0.831469612302545 / 2384e-9,
      /* 12 */
      906e-8 * 0.831469612302545 / 2384e-9,
      116348e-9 * 0.831469612302545 / 2384e-9,
      1766682e-9 * 0.831469612302545 / 2384e-9,
      0.014358521 * 0.831469612302545 / 2384e-9,
      -0.021372318 * 0.831469612302545 / 2384e-9,
      -314188e-8 * 0.831469612302545 / 2384e-9,
      -339031e-9 * 0.831469612302545 / 2384e-9,
      -1955e-8 * 0.831469612302545 / 2384e-9,
      0.6681786379192989,
      0.7653668647301797,
      -477e-9 * 0.857728610000272 / 2384e-9,
      108719e-9 * 0.857728610000272 / 2384e-9,
      82922e-8 * 0.857728610000272 / 2384e-9,
      1399517e-9 * 0.857728610000272 / 2384e-9,
      0.035242081 * 0.857728610000272 / 2384e-9,
      421524e-8 * 0.857728610000272 / 2384e-9,
      989437e-9 * 0.857728610000272 / 2384e-9,
      87261e-9 * 0.857728610000272 / 2384e-9,
      /* 11 */
      8106e-9 * 0.857728610000272 / 2384e-9,
      93937e-9 * 0.857728610000272 / 2384e-9,
      1597881e-9 * 0.857728610000272 / 2384e-9,
      0.013489246 * 0.857728610000272 / 2384e-9,
      -0.022228718 * 0.857728610000272 / 2384e-9,
      -3306866e-9 * 0.857728610000272 / 2384e-9,
      -371456e-9 * 0.857728610000272 / 2384e-9,
      -21458e-9 * 0.857728610000272 / 2384e-9,
      0.5993769336819237,
      0.9427934736519954,
      -477e-9 * 0.881921264348355 / 2384e-9,
      108719e-9 * 0.881921264348355 / 2384e-9,
      78392e-8 * 0.881921264348355 / 2384e-9,
      971317e-9 * 0.881921264348355 / 2384e-9,
      0.035007 * 0.881921264348355 / 2384e-9,
      4357815e-9 * 0.881921264348355 / 2384e-9,
      980854e-9 * 0.881921264348355 / 2384e-9,
      83923e-9 * 0.881921264348355 / 2384e-9,
      /* 10 */
      7629e-9 * 0.881921264348355 / 2384e-9,
      72956e-9 * 0.881921264348355 / 2384e-9,
      1432419e-9 * 0.881921264348355 / 2384e-9,
      0.012627602 * 0.881921264348355 / 2384e-9,
      -0.02307415 * 0.881921264348355 / 2384e-9,
      -3467083e-9 * 0.881921264348355 / 2384e-9,
      -404358e-9 * 0.881921264348355 / 2384e-9,
      -23365e-9 * 0.881921264348355 / 2384e-9,
      0.5345111359507916,
      1.111140466039205,
      -954e-9 * 0.903989293123443 / 2384e-9,
      108242e-9 * 0.903989293123443 / 2384e-9,
      731945e-9 * 0.903989293123443 / 2384e-9,
      515938e-9 * 0.903989293123443 / 2384e-9,
      0.034730434 * 0.903989293123443 / 2384e-9,
      4477024e-9 * 0.903989293123443 / 2384e-9,
      968933e-9 * 0.903989293123443 / 2384e-9,
      80585e-9 * 0.903989293123443 / 2384e-9,
      /* 9 */
      6676e-9 * 0.903989293123443 / 2384e-9,
      52929e-9 * 0.903989293123443 / 2384e-9,
      1269817e-9 * 0.903989293123443 / 2384e-9,
      0.011775017 * 0.903989293123443 / 2384e-9,
      -0.023907185 * 0.903989293123443 / 2384e-9,
      -3622532e-9 * 0.903989293123443 / 2384e-9,
      -438213e-9 * 0.903989293123443 / 2384e-9,
      -25272e-9 * 0.903989293123443 / 2384e-9,
      0.4729647758913199,
      1.268786568327291,
      -954e-9 * 0.9238795325112867 / 2384e-9,
      106812e-9 * 0.9238795325112867 / 2384e-9,
      674248e-9 * 0.9238795325112867 / 2384e-9,
      33379e-9 * 0.9238795325112867 / 2384e-9,
      0.034412861 * 0.9238795325112867 / 2384e-9,
      4573822e-9 * 0.9238795325112867 / 2384e-9,
      954151e-9 * 0.9238795325112867 / 2384e-9,
      76771e-9 * 0.9238795325112867 / 2384e-9,
      6199e-9 * 0.9238795325112867 / 2384e-9,
      34332e-9 * 0.9238795325112867 / 2384e-9,
      1111031e-9 * 0.9238795325112867 / 2384e-9,
      0.010933399 * 0.9238795325112867 / 2384e-9,
      -0.024725437 * 0.9238795325112867 / 2384e-9,
      -3771782e-9 * 0.9238795325112867 / 2384e-9,
      -472546e-9 * 0.9238795325112867 / 2384e-9,
      -27657e-9 * 0.9238795325112867 / 2384e-9,
      0.41421356237309503,
      /* tan(PI/8) */
      1.414213562373095,
      -954e-9 * 0.941544065183021 / 2384e-9,
      105381e-9 * 0.941544065183021 / 2384e-9,
      610352e-9 * 0.941544065183021 / 2384e-9,
      -475883e-9 * 0.941544065183021 / 2384e-9,
      0.03405571 * 0.941544065183021 / 2384e-9,
      4649162e-9 * 0.941544065183021 / 2384e-9,
      935555e-9 * 0.941544065183021 / 2384e-9,
      73433e-9 * 0.941544065183021 / 2384e-9,
      /* 7 */
      5245e-9 * 0.941544065183021 / 2384e-9,
      17166e-9 * 0.941544065183021 / 2384e-9,
      956535e-9 * 0.941544065183021 / 2384e-9,
      0.010103703 * 0.941544065183021 / 2384e-9,
      -0.025527 * 0.941544065183021 / 2384e-9,
      -3914356e-9 * 0.941544065183021 / 2384e-9,
      -507355e-9 * 0.941544065183021 / 2384e-9,
      -30041e-9 * 0.941544065183021 / 2384e-9,
      0.3578057213145241,
      1.546020906725474,
      -954e-9 * 0.956940335732209 / 2384e-9,
      10252e-8 * 0.956940335732209 / 2384e-9,
      539303e-9 * 0.956940335732209 / 2384e-9,
      -1011848e-9 * 0.956940335732209 / 2384e-9,
      0.033659935 * 0.956940335732209 / 2384e-9,
      4703045e-9 * 0.956940335732209 / 2384e-9,
      915051e-9 * 0.956940335732209 / 2384e-9,
      70095e-9 * 0.956940335732209 / 2384e-9,
      /* 6 */
      4768e-9 * 0.956940335732209 / 2384e-9,
      954e-9 * 0.956940335732209 / 2384e-9,
      806808e-9 * 0.956940335732209 / 2384e-9,
      9287834e-9 * 0.956940335732209 / 2384e-9,
      -0.026310921 * 0.956940335732209 / 2384e-9,
      -4048824e-9 * 0.956940335732209 / 2384e-9,
      -542164e-9 * 0.956940335732209 / 2384e-9,
      -32425e-9 * 0.956940335732209 / 2384e-9,
      0.3033466836073424,
      1.66293922460509,
      -1431e-9 * 0.970031253194544 / 2384e-9,
      99182e-9 * 0.970031253194544 / 2384e-9,
      462532e-9 * 0.970031253194544 / 2384e-9,
      -1573563e-9 * 0.970031253194544 / 2384e-9,
      0.033225536 * 0.970031253194544 / 2384e-9,
      4737377e-9 * 0.970031253194544 / 2384e-9,
      891685e-9 * 0.970031253194544 / 2384e-9,
      6628e-8 * 0.970031253194544 / 2384e-9,
      /* 5 */
      4292e-9 * 0.970031253194544 / 2384e-9,
      -13828e-9 * 0.970031253194544 / 2384e-9,
      66185e-8 * 0.970031253194544 / 2384e-9,
      8487225e-9 * 0.970031253194544 / 2384e-9,
      -0.02707386 * 0.970031253194544 / 2384e-9,
      -4174709e-9 * 0.970031253194544 / 2384e-9,
      -576973e-9 * 0.970031253194544 / 2384e-9,
      -34809e-9 * 0.970031253194544 / 2384e-9,
      0.2504869601913055,
      1.76384252869671,
      -1431e-9 * 0.98078528040323 / 2384e-9,
      95367e-9 * 0.98078528040323 / 2384e-9,
      378609e-9 * 0.98078528040323 / 2384e-9,
      -2161503e-9 * 0.98078528040323 / 2384e-9,
      0.032754898 * 0.98078528040323 / 2384e-9,
      4752159e-9 * 0.98078528040323 / 2384e-9,
      866413e-9 * 0.98078528040323 / 2384e-9,
      62943e-9 * 0.98078528040323 / 2384e-9,
      /* 4 */
      3815e-9 * 0.98078528040323 / 2384e-9,
      -2718e-8 * 0.98078528040323 / 2384e-9,
      522137e-9 * 0.98078528040323 / 2384e-9,
      7703304e-9 * 0.98078528040323 / 2384e-9,
      -0.027815342 * 0.98078528040323 / 2384e-9,
      -4290581e-9 * 0.98078528040323 / 2384e-9,
      -611782e-9 * 0.98078528040323 / 2384e-9,
      -3767e-8 * 0.98078528040323 / 2384e-9,
      0.198912367379658,
      1.847759065022573,
      -1907e-9 * 0.989176509964781 / 2384e-9,
      90122e-9 * 0.989176509964781 / 2384e-9,
      288486e-9 * 0.989176509964781 / 2384e-9,
      -2774239e-9 * 0.989176509964781 / 2384e-9,
      0.03224802 * 0.989176509964781 / 2384e-9,
      4748821e-9 * 0.989176509964781 / 2384e-9,
      838757e-9 * 0.989176509964781 / 2384e-9,
      59605e-9 * 0.989176509964781 / 2384e-9,
      /* 3 */
      3338e-9 * 0.989176509964781 / 2384e-9,
      -39577e-9 * 0.989176509964781 / 2384e-9,
      388145e-9 * 0.989176509964781 / 2384e-9,
      6937027e-9 * 0.989176509964781 / 2384e-9,
      -0.028532982 * 0.989176509964781 / 2384e-9,
      -4395962e-9 * 0.989176509964781 / 2384e-9,
      -646591e-9 * 0.989176509964781 / 2384e-9,
      -40531e-9 * 0.989176509964781 / 2384e-9,
      0.1483359875383474,
      1.913880671464418,
      -1907e-9 * 0.995184726672197 / 2384e-9,
      844e-7 * 0.995184726672197 / 2384e-9,
      191689e-9 * 0.995184726672197 / 2384e-9,
      -3411293e-9 * 0.995184726672197 / 2384e-9,
      0.03170681 * 0.995184726672197 / 2384e-9,
      4728317e-9 * 0.995184726672197 / 2384e-9,
      809669e-9 * 0.995184726672197 / 2384e-9,
      5579e-8 * 0.995184726672197 / 2384e-9,
      3338e-9 * 0.995184726672197 / 2384e-9,
      -50545e-9 * 0.995184726672197 / 2384e-9,
      259876e-9 * 0.995184726672197 / 2384e-9,
      6189346e-9 * 0.995184726672197 / 2384e-9,
      -0.029224873 * 0.995184726672197 / 2384e-9,
      -4489899e-9 * 0.995184726672197 / 2384e-9,
      -680923e-9 * 0.995184726672197 / 2384e-9,
      -43392e-9 * 0.995184726672197 / 2384e-9,
      0.09849140335716425,
      1.961570560806461,
      -2384e-9 * 0.998795456205172 / 2384e-9,
      77724e-9 * 0.998795456205172 / 2384e-9,
      88215e-9 * 0.998795456205172 / 2384e-9,
      -4072189e-9 * 0.998795456205172 / 2384e-9,
      0.031132698 * 0.998795456205172 / 2384e-9,
      4691124e-9 * 0.998795456205172 / 2384e-9,
      779152e-9 * 0.998795456205172 / 2384e-9,
      52929e-9 * 0.998795456205172 / 2384e-9,
      2861e-9 * 0.998795456205172 / 2384e-9,
      -60558e-9 * 0.998795456205172 / 2384e-9,
      137329e-9 * 0.998795456205172 / 2384e-9,
      546217e-8 * 0.998795456205172 / 2384e-9,
      -0.02989006 * 0.998795456205172 / 2384e-9,
      -4570484e-9 * 0.998795456205172 / 2384e-9,
      -714302e-9 * 0.998795456205172 / 2384e-9,
      -46253e-9 * 0.998795456205172 / 2384e-9,
      0.04912684976946725,
      1.990369453344394,
      0.035780907 * Util.SQRT2 * 0.5 / 2384e-9,
      0.017876148 * Util.SQRT2 * 0.5 / 2384e-9,
      3134727e-9 * Util.SQRT2 * 0.5 / 2384e-9,
      2457142e-9 * Util.SQRT2 * 0.5 / 2384e-9,
      971317e-9 * Util.SQRT2 * 0.5 / 2384e-9,
      218868e-9 * Util.SQRT2 * 0.5 / 2384e-9,
      101566e-9 * Util.SQRT2 * 0.5 / 2384e-9,
      13828e-9 * Util.SQRT2 * 0.5 / 2384e-9,
      0.030526638 / 2384e-9,
      4638195e-9 / 2384e-9,
      747204e-9 / 2384e-9,
      49591e-9 / 2384e-9,
      4756451e-9 / 2384e-9,
      21458e-9 / 2384e-9,
      -69618e-9 / 2384e-9
      /* 2.384e-06/2.384e-06 */
    ];
    var NS = 12;
    var NL = 36;
    var win = [
      [
        2382191739347913e-28,
        6423305872147834e-28,
        9400849094049688e-28,
        1122435026096556e-27,
        1183840321267481e-27,
        1122435026096556e-27,
        940084909404969e-27,
        6423305872147839e-28,
        2382191739347918e-28,
        5456116108943412e-27,
        4878985199565852e-27,
        4240448995017367e-27,
        3559909094758252e-27,
        2858043359288075e-27,
        2156177623817898e-27,
        1475637723558783e-27,
        8371015190102974e-28,
        2599706096327376e-28,
        -5456116108943412e-27,
        -4878985199565852e-27,
        -4240448995017367e-27,
        -3559909094758252e-27,
        -2858043359288076e-27,
        -2156177623817898e-27,
        -1475637723558783e-27,
        -8371015190102975e-28,
        -2599706096327376e-28,
        -2382191739347923e-28,
        -6423305872147843e-28,
        -9400849094049696e-28,
        -1122435026096556e-27,
        -1183840321267481e-27,
        -1122435026096556e-27,
        -9400849094049694e-28,
        -642330587214784e-27,
        -2382191739347918e-28
      ],
      [
        2382191739347913e-28,
        6423305872147834e-28,
        9400849094049688e-28,
        1122435026096556e-27,
        1183840321267481e-27,
        1122435026096556e-27,
        9400849094049688e-28,
        6423305872147841e-28,
        2382191739347918e-28,
        5456116108943413e-27,
        4878985199565852e-27,
        4240448995017367e-27,
        3559909094758253e-27,
        2858043359288075e-27,
        2156177623817898e-27,
        1475637723558782e-27,
        8371015190102975e-28,
        2599706096327376e-28,
        -5461314069809755e-27,
        -4921085770524055e-27,
        -4343405037091838e-27,
        -3732668368707687e-27,
        -3093523840190885e-27,
        -2430835727329465e-27,
        -1734679010007751e-27,
        -974825365660928e-27,
        -2797435120168326e-28,
        0,
        0,
        0,
        0,
        0,
        0,
        -2283748241799531e-28,
        -4037858874020686e-28,
        -2146547464825323e-28
      ],
      [
        0.1316524975873958,
        /* win[SHORT_TYPE] */
        0.414213562373095,
        0.7673269879789602,
        1.091308501069271,
        /* tantab_l */
        1.303225372841206,
        1.56968557711749,
        1.920982126971166,
        2.414213562373094,
        3.171594802363212,
        4.510708503662055,
        7.595754112725146,
        22.90376554843115,
        0.984807753012208,
        /* cx */
        0.6427876096865394,
        0.3420201433256688,
        0.9396926207859084,
        -0.1736481776669303,
        -0.7660444431189779,
        0.8660254037844387,
        0.5,
        -0.5144957554275265,
        /* ca */
        -0.4717319685649723,
        -0.3133774542039019,
        -0.1819131996109812,
        -0.09457419252642064,
        -0.04096558288530405,
        -0.01419856857247115,
        -0.003699974673760037,
        0.8574929257125442,
        /* cs */
        0.8817419973177052,
        0.9496286491027329,
        0.9833145924917901,
        0.9955178160675857,
        0.9991605581781475,
        0.999899195244447,
        0.9999931550702802
      ],
      [
        0,
        0,
        0,
        0,
        0,
        0,
        2283748241799531e-28,
        4037858874020686e-28,
        2146547464825323e-28,
        5461314069809755e-27,
        4921085770524055e-27,
        4343405037091838e-27,
        3732668368707687e-27,
        3093523840190885e-27,
        2430835727329466e-27,
        1734679010007751e-27,
        974825365660928e-27,
        2797435120168326e-28,
        -5456116108943413e-27,
        -4878985199565852e-27,
        -4240448995017367e-27,
        -3559909094758253e-27,
        -2858043359288075e-27,
        -2156177623817898e-27,
        -1475637723558782e-27,
        -8371015190102975e-28,
        -2599706096327376e-28,
        -2382191739347913e-28,
        -6423305872147834e-28,
        -9400849094049688e-28,
        -1122435026096556e-27,
        -1183840321267481e-27,
        -1122435026096556e-27,
        -9400849094049688e-28,
        -6423305872147841e-28,
        -2382191739347918e-28
      ]
    ];
    var tantab_l = win[Encoder.SHORT_TYPE];
    var cx = win[Encoder.SHORT_TYPE];
    var ca = win[Encoder.SHORT_TYPE];
    var cs = win[Encoder.SHORT_TYPE];
    var order = [
      0,
      1,
      16,
      17,
      8,
      9,
      24,
      25,
      4,
      5,
      20,
      21,
      12,
      13,
      28,
      29,
      2,
      3,
      18,
      19,
      10,
      11,
      26,
      27,
      6,
      7,
      22,
      23,
      14,
      15,
      30,
      31
    ];
    function window_subband(x1, x1Pos, a) {
      var wp = 10;
      var x2 = x1Pos + 238 - 14 - 286;
      for (var i = -15; i < 0; i++) {
        var w, s, t;
        w = enwindow[wp + -10];
        s = x1[x2 + -224] * w;
        t = x1[x1Pos + 224] * w;
        w = enwindow[wp + -9];
        s += x1[x2 + -160] * w;
        t += x1[x1Pos + 160] * w;
        w = enwindow[wp + -8];
        s += x1[x2 + -96] * w;
        t += x1[x1Pos + 96] * w;
        w = enwindow[wp + -7];
        s += x1[x2 + -32] * w;
        t += x1[x1Pos + 32] * w;
        w = enwindow[wp + -6];
        s += x1[x2 + 32] * w;
        t += x1[x1Pos + -32] * w;
        w = enwindow[wp + -5];
        s += x1[x2 + 96] * w;
        t += x1[x1Pos + -96] * w;
        w = enwindow[wp + -4];
        s += x1[x2 + 160] * w;
        t += x1[x1Pos + -160] * w;
        w = enwindow[wp + -3];
        s += x1[x2 + 224] * w;
        t += x1[x1Pos + -224] * w;
        w = enwindow[wp + -2];
        s += x1[x1Pos + -256] * w;
        t -= x1[x2 + 256] * w;
        w = enwindow[wp + -1];
        s += x1[x1Pos + -192] * w;
        t -= x1[x2 + 192] * w;
        w = enwindow[wp + 0];
        s += x1[x1Pos + -128] * w;
        t -= x1[x2 + 128] * w;
        w = enwindow[wp + 1];
        s += x1[x1Pos + -64] * w;
        t -= x1[x2 + 64] * w;
        w = enwindow[wp + 2];
        s += x1[x1Pos + 0] * w;
        t -= x1[x2 + 0] * w;
        w = enwindow[wp + 3];
        s += x1[x1Pos + 64] * w;
        t -= x1[x2 + -64] * w;
        w = enwindow[wp + 4];
        s += x1[x1Pos + 128] * w;
        t -= x1[x2 + -128] * w;
        w = enwindow[wp + 5];
        s += x1[x1Pos + 192] * w;
        t -= x1[x2 + -192] * w;
        s *= enwindow[wp + 6];
        w = t - s;
        a[30 + i * 2] = t + s;
        a[31 + i * 2] = enwindow[wp + 7] * w;
        wp += 18;
        x1Pos--;
        x2++;
      }
      {
        var s, t, u, v;
        t = x1[x1Pos + -16] * enwindow[wp + -10];
        s = x1[x1Pos + -32] * enwindow[wp + -2];
        t += (x1[x1Pos + -48] - x1[x1Pos + 16]) * enwindow[wp + -9];
        s += x1[x1Pos + -96] * enwindow[wp + -1];
        t += (x1[x1Pos + -80] + x1[x1Pos + 48]) * enwindow[wp + -8];
        s += x1[x1Pos + -160] * enwindow[wp + 0];
        t += (x1[x1Pos + -112] - x1[x1Pos + 80]) * enwindow[wp + -7];
        s += x1[x1Pos + -224] * enwindow[wp + 1];
        t += (x1[x1Pos + -144] + x1[x1Pos + 112]) * enwindow[wp + -6];
        s -= x1[x1Pos + 32] * enwindow[wp + 2];
        t += (x1[x1Pos + -176] - x1[x1Pos + 144]) * enwindow[wp + -5];
        s -= x1[x1Pos + 96] * enwindow[wp + 3];
        t += (x1[x1Pos + -208] + x1[x1Pos + 176]) * enwindow[wp + -4];
        s -= x1[x1Pos + 160] * enwindow[wp + 4];
        t += (x1[x1Pos + -240] - x1[x1Pos + 208]) * enwindow[wp + -3];
        s -= x1[x1Pos + 224];
        u = s - t;
        v = s + t;
        t = a[14];
        s = a[15] - t;
        a[31] = v + t;
        a[30] = u + s;
        a[15] = u - s;
        a[14] = v - t;
      }
      {
        var xr;
        xr = a[28] - a[0];
        a[0] += a[28];
        a[28] = xr * enwindow[wp + -2 * 18 + 7];
        xr = a[29] - a[1];
        a[1] += a[29];
        a[29] = xr * enwindow[wp + -2 * 18 + 7];
        xr = a[26] - a[2];
        a[2] += a[26];
        a[26] = xr * enwindow[wp + -4 * 18 + 7];
        xr = a[27] - a[3];
        a[3] += a[27];
        a[27] = xr * enwindow[wp + -4 * 18 + 7];
        xr = a[24] - a[4];
        a[4] += a[24];
        a[24] = xr * enwindow[wp + -6 * 18 + 7];
        xr = a[25] - a[5];
        a[5] += a[25];
        a[25] = xr * enwindow[wp + -6 * 18 + 7];
        xr = a[22] - a[6];
        a[6] += a[22];
        a[22] = xr * Util.SQRT2;
        xr = a[23] - a[7];
        a[7] += a[23];
        a[23] = xr * Util.SQRT2 - a[7];
        a[7] -= a[6];
        a[22] -= a[7];
        a[23] -= a[22];
        xr = a[6];
        a[6] = a[31] - xr;
        a[31] = a[31] + xr;
        xr = a[7];
        a[7] = a[30] - xr;
        a[30] = a[30] + xr;
        xr = a[22];
        a[22] = a[15] - xr;
        a[15] = a[15] + xr;
        xr = a[23];
        a[23] = a[14] - xr;
        a[14] = a[14] + xr;
        xr = a[20] - a[8];
        a[8] += a[20];
        a[20] = xr * enwindow[wp + -10 * 18 + 7];
        xr = a[21] - a[9];
        a[9] += a[21];
        a[21] = xr * enwindow[wp + -10 * 18 + 7];
        xr = a[18] - a[10];
        a[10] += a[18];
        a[18] = xr * enwindow[wp + -12 * 18 + 7];
        xr = a[19] - a[11];
        a[11] += a[19];
        a[19] = xr * enwindow[wp + -12 * 18 + 7];
        xr = a[16] - a[12];
        a[12] += a[16];
        a[16] = xr * enwindow[wp + -14 * 18 + 7];
        xr = a[17] - a[13];
        a[13] += a[17];
        a[17] = xr * enwindow[wp + -14 * 18 + 7];
        xr = -a[20] + a[24];
        a[20] += a[24];
        a[24] = xr * enwindow[wp + -12 * 18 + 7];
        xr = -a[21] + a[25];
        a[21] += a[25];
        a[25] = xr * enwindow[wp + -12 * 18 + 7];
        xr = a[4] - a[8];
        a[4] += a[8];
        a[8] = xr * enwindow[wp + -12 * 18 + 7];
        xr = a[5] - a[9];
        a[5] += a[9];
        a[9] = xr * enwindow[wp + -12 * 18 + 7];
        xr = a[0] - a[12];
        a[0] += a[12];
        a[12] = xr * enwindow[wp + -4 * 18 + 7];
        xr = a[1] - a[13];
        a[1] += a[13];
        a[13] = xr * enwindow[wp + -4 * 18 + 7];
        xr = a[16] - a[28];
        a[16] += a[28];
        a[28] = xr * enwindow[wp + -4 * 18 + 7];
        xr = -a[17] + a[29];
        a[17] += a[29];
        a[29] = xr * enwindow[wp + -4 * 18 + 7];
        xr = Util.SQRT2 * (a[2] - a[10]);
        a[2] += a[10];
        a[10] = xr;
        xr = Util.SQRT2 * (a[3] - a[11]);
        a[3] += a[11];
        a[11] = xr;
        xr = Util.SQRT2 * (-a[18] + a[26]);
        a[18] += a[26];
        a[26] = xr - a[18];
        xr = Util.SQRT2 * (-a[19] + a[27]);
        a[19] += a[27];
        a[27] = xr - a[19];
        xr = a[2];
        a[19] -= a[3];
        a[3] -= xr;
        a[2] = a[31] - xr;
        a[31] += xr;
        xr = a[3];
        a[11] -= a[19];
        a[18] -= xr;
        a[3] = a[30] - xr;
        a[30] += xr;
        xr = a[18];
        a[27] -= a[11];
        a[19] -= xr;
        a[18] = a[15] - xr;
        a[15] += xr;
        xr = a[19];
        a[10] -= xr;
        a[19] = a[14] - xr;
        a[14] += xr;
        xr = a[10];
        a[11] -= xr;
        a[10] = a[23] - xr;
        a[23] += xr;
        xr = a[11];
        a[26] -= xr;
        a[11] = a[22] - xr;
        a[22] += xr;
        xr = a[26];
        a[27] -= xr;
        a[26] = a[7] - xr;
        a[7] += xr;
        xr = a[27];
        a[27] = a[6] - xr;
        a[6] += xr;
        xr = Util.SQRT2 * (a[0] - a[4]);
        a[0] += a[4];
        a[4] = xr;
        xr = Util.SQRT2 * (a[1] - a[5]);
        a[1] += a[5];
        a[5] = xr;
        xr = Util.SQRT2 * (a[16] - a[20]);
        a[16] += a[20];
        a[20] = xr;
        xr = Util.SQRT2 * (a[17] - a[21]);
        a[17] += a[21];
        a[21] = xr;
        xr = -Util.SQRT2 * (a[8] - a[12]);
        a[8] += a[12];
        a[12] = xr - a[8];
        xr = -Util.SQRT2 * (a[9] - a[13]);
        a[9] += a[13];
        a[13] = xr - a[9];
        xr = -Util.SQRT2 * (a[25] - a[29]);
        a[25] += a[29];
        a[29] = xr - a[25];
        xr = -Util.SQRT2 * (a[24] + a[28]);
        a[24] -= a[28];
        a[28] = xr - a[24];
        xr = a[24] - a[16];
        a[24] = xr;
        xr = a[20] - xr;
        a[20] = xr;
        xr = a[28] - xr;
        a[28] = xr;
        xr = a[25] - a[17];
        a[25] = xr;
        xr = a[21] - xr;
        a[21] = xr;
        xr = a[29] - xr;
        a[29] = xr;
        xr = a[17] - a[1];
        a[17] = xr;
        xr = a[9] - xr;
        a[9] = xr;
        xr = a[25] - xr;
        a[25] = xr;
        xr = a[5] - xr;
        a[5] = xr;
        xr = a[21] - xr;
        a[21] = xr;
        xr = a[13] - xr;
        a[13] = xr;
        xr = a[29] - xr;
        a[29] = xr;
        xr = a[1] - a[0];
        a[1] = xr;
        xr = a[16] - xr;
        a[16] = xr;
        xr = a[17] - xr;
        a[17] = xr;
        xr = a[8] - xr;
        a[8] = xr;
        xr = a[9] - xr;
        a[9] = xr;
        xr = a[24] - xr;
        a[24] = xr;
        xr = a[25] - xr;
        a[25] = xr;
        xr = a[4] - xr;
        a[4] = xr;
        xr = a[5] - xr;
        a[5] = xr;
        xr = a[20] - xr;
        a[20] = xr;
        xr = a[21] - xr;
        a[21] = xr;
        xr = a[12] - xr;
        a[12] = xr;
        xr = a[13] - xr;
        a[13] = xr;
        xr = a[28] - xr;
        a[28] = xr;
        xr = a[29] - xr;
        a[29] = xr;
        xr = a[0];
        a[0] += a[31];
        a[31] -= xr;
        xr = a[1];
        a[1] += a[30];
        a[30] -= xr;
        xr = a[16];
        a[16] += a[15];
        a[15] -= xr;
        xr = a[17];
        a[17] += a[14];
        a[14] -= xr;
        xr = a[8];
        a[8] += a[23];
        a[23] -= xr;
        xr = a[9];
        a[9] += a[22];
        a[22] -= xr;
        xr = a[24];
        a[24] += a[7];
        a[7] -= xr;
        xr = a[25];
        a[25] += a[6];
        a[6] -= xr;
        xr = a[4];
        a[4] += a[27];
        a[27] -= xr;
        xr = a[5];
        a[5] += a[26];
        a[26] -= xr;
        xr = a[20];
        a[20] += a[11];
        a[11] -= xr;
        xr = a[21];
        a[21] += a[10];
        a[10] -= xr;
        xr = a[12];
        a[12] += a[19];
        a[19] -= xr;
        xr = a[13];
        a[13] += a[18];
        a[18] -= xr;
        xr = a[28];
        a[28] += a[3];
        a[3] -= xr;
        xr = a[29];
        a[29] += a[2];
        a[2] -= xr;
      }
    }
    function mdct_short(inout, inoutPos) {
      for (var l = 0; l < 3; l++) {
        var tc0, tc1, tc2, ts0, ts1, ts2;
        ts0 = inout[inoutPos + 2 * 3] * win[Encoder.SHORT_TYPE][0] - inout[inoutPos + 5 * 3];
        tc0 = inout[inoutPos + 0 * 3] * win[Encoder.SHORT_TYPE][2] - inout[inoutPos + 3 * 3];
        tc1 = ts0 + tc0;
        tc2 = ts0 - tc0;
        ts0 = inout[inoutPos + 5 * 3] * win[Encoder.SHORT_TYPE][0] + inout[inoutPos + 2 * 3];
        tc0 = inout[inoutPos + 3 * 3] * win[Encoder.SHORT_TYPE][2] + inout[inoutPos + 0 * 3];
        ts1 = ts0 + tc0;
        ts2 = -ts0 + tc0;
        tc0 = (inout[inoutPos + 1 * 3] * win[Encoder.SHORT_TYPE][1] - inout[inoutPos + 4 * 3]) * 2069978111953089e-26;
        ts0 = (inout[inoutPos + 4 * 3] * win[Encoder.SHORT_TYPE][1] + inout[inoutPos + 1 * 3]) * 2069978111953089e-26;
        inout[inoutPos + 3 * 0] = tc1 * 190752519173728e-25 + tc0;
        inout[inoutPos + 3 * 5] = -ts1 * 190752519173728e-25 + ts0;
        tc2 = tc2 * 0.8660254037844387 * 1907525191737281e-26;
        ts1 = ts1 * 0.5 * 1907525191737281e-26 + ts0;
        inout[inoutPos + 3 * 1] = tc2 - ts1;
        inout[inoutPos + 3 * 2] = tc2 + ts1;
        tc1 = tc1 * 0.5 * 1907525191737281e-26 - tc0;
        ts2 = ts2 * 0.8660254037844387 * 1907525191737281e-26;
        inout[inoutPos + 3 * 3] = tc1 + ts2;
        inout[inoutPos + 3 * 4] = tc1 - ts2;
        inoutPos++;
      }
    }
    function mdct_long(out, outPos, _in) {
      var ct, st;
      {
        var tc1, tc2, tc3, tc4, ts5, ts6, ts7, ts8;
        tc1 = _in[17] - _in[9];
        tc3 = _in[15] - _in[11];
        tc4 = _in[14] - _in[12];
        ts5 = _in[0] + _in[8];
        ts6 = _in[1] + _in[7];
        ts7 = _in[2] + _in[6];
        ts8 = _in[3] + _in[5];
        out[outPos + 17] = ts5 + ts7 - ts8 - (ts6 - _in[4]);
        st = (ts5 + ts7 - ts8) * cx[12 + 7] + (ts6 - _in[4]);
        ct = (tc1 - tc3 - tc4) * cx[12 + 6];
        out[outPos + 5] = ct + st;
        out[outPos + 6] = ct - st;
        tc2 = (_in[16] - _in[10]) * cx[12 + 6];
        ts6 = ts6 * cx[12 + 7] + _in[4];
        ct = tc1 * cx[12 + 0] + tc2 + tc3 * cx[12 + 1] + tc4 * cx[12 + 2];
        st = -ts5 * cx[12 + 4] + ts6 - ts7 * cx[12 + 5] + ts8 * cx[12 + 3];
        out[outPos + 1] = ct + st;
        out[outPos + 2] = ct - st;
        ct = tc1 * cx[12 + 1] - tc2 - tc3 * cx[12 + 2] + tc4 * cx[12 + 0];
        st = -ts5 * cx[12 + 5] + ts6 - ts7 * cx[12 + 3] + ts8 * cx[12 + 4];
        out[outPos + 9] = ct + st;
        out[outPos + 10] = ct - st;
        ct = tc1 * cx[12 + 2] - tc2 + tc3 * cx[12 + 0] - tc4 * cx[12 + 1];
        st = ts5 * cx[12 + 3] - ts6 + ts7 * cx[12 + 4] - ts8 * cx[12 + 5];
        out[outPos + 13] = ct + st;
        out[outPos + 14] = ct - st;
      }
      {
        var ts1, ts2, ts3, ts4, tc5, tc6, tc7, tc8;
        ts1 = _in[8] - _in[0];
        ts3 = _in[6] - _in[2];
        ts4 = _in[5] - _in[3];
        tc5 = _in[17] + _in[9];
        tc6 = _in[16] + _in[10];
        tc7 = _in[15] + _in[11];
        tc8 = _in[14] + _in[12];
        out[outPos + 0] = tc5 + tc7 + tc8 + (tc6 + _in[13]);
        ct = (tc5 + tc7 + tc8) * cx[12 + 7] - (tc6 + _in[13]);
        st = (ts1 - ts3 + ts4) * cx[12 + 6];
        out[outPos + 11] = ct + st;
        out[outPos + 12] = ct - st;
        ts2 = (_in[7] - _in[1]) * cx[12 + 6];
        tc6 = _in[13] - tc6 * cx[12 + 7];
        ct = tc5 * cx[12 + 3] - tc6 + tc7 * cx[12 + 4] + tc8 * cx[12 + 5];
        st = ts1 * cx[12 + 2] + ts2 + ts3 * cx[12 + 0] + ts4 * cx[12 + 1];
        out[outPos + 3] = ct + st;
        out[outPos + 4] = ct - st;
        ct = -tc5 * cx[12 + 5] + tc6 - tc7 * cx[12 + 3] - tc8 * cx[12 + 4];
        st = ts1 * cx[12 + 1] + ts2 - ts3 * cx[12 + 2] - ts4 * cx[12 + 0];
        out[outPos + 7] = ct + st;
        out[outPos + 8] = ct - st;
        ct = -tc5 * cx[12 + 4] + tc6 - tc7 * cx[12 + 5] - tc8 * cx[12 + 3];
        st = ts1 * cx[12 + 0] - ts2 + ts3 * cx[12 + 1] - ts4 * cx[12 + 2];
        out[outPos + 15] = ct + st;
        out[outPos + 16] = ct - st;
      }
    }
    this.mdct_sub48 = function(gfc, w0, w1) {
      var wk = w0;
      var wkPos = 286;
      for (var ch = 0; ch < gfc.channels_out; ch++) {
        for (var gr = 0; gr < gfc.mode_gr; gr++) {
          var band;
          var gi = gfc.l3_side.tt[gr][ch];
          var mdct_enc = gi.xr;
          var mdct_encPos = 0;
          var samp = gfc.sb_sample[ch][1 - gr];
          var sampPos = 0;
          for (var k = 0; k < 18 / 2; k++) {
            window_subband(wk, wkPos, samp[sampPos]);
            window_subband(wk, wkPos + 32, samp[sampPos + 1]);
            sampPos += 2;
            wkPos += 64;
            for (band = 1; band < 32; band += 2) {
              samp[sampPos - 1][band] *= -1;
            }
          }
          for (band = 0; band < 32; band++, mdct_encPos += 18) {
            var type = gi.block_type;
            var band0 = gfc.sb_sample[ch][gr];
            var band1 = gfc.sb_sample[ch][1 - gr];
            if (gi.mixed_block_flag != 0 && band < 2)
              type = 0;
            if (gfc.amp_filter[band] < 1e-12) {
              Arrays.fill(
                mdct_enc,
                mdct_encPos + 0,
                mdct_encPos + 18,
                0
              );
            } else {
              if (gfc.amp_filter[band] < 1) {
                for (var k = 0; k < 18; k++)
                  band1[k][order[band]] *= gfc.amp_filter[band];
              }
              if (type == Encoder.SHORT_TYPE) {
                for (var k = -NS / 4; k < 0; k++) {
                  var w = win[Encoder.SHORT_TYPE][k + 3];
                  mdct_enc[mdct_encPos + k * 3 + 9] = band0[9 + k][order[band]] * w - band0[8 - k][order[band]];
                  mdct_enc[mdct_encPos + k * 3 + 18] = band0[14 - k][order[band]] * w + band0[15 + k][order[band]];
                  mdct_enc[mdct_encPos + k * 3 + 10] = band0[15 + k][order[band]] * w - band0[14 - k][order[band]];
                  mdct_enc[mdct_encPos + k * 3 + 19] = band1[2 - k][order[band]] * w + band1[3 + k][order[band]];
                  mdct_enc[mdct_encPos + k * 3 + 11] = band1[3 + k][order[band]] * w - band1[2 - k][order[band]];
                  mdct_enc[mdct_encPos + k * 3 + 20] = band1[8 - k][order[band]] * w + band1[9 + k][order[band]];
                }
                mdct_short(mdct_enc, mdct_encPos);
              } else {
                var work = new_float(18);
                for (var k = -NL / 4; k < 0; k++) {
                  var a, b;
                  a = win[type][k + 27] * band1[k + 9][order[band]] + win[type][k + 36] * band1[8 - k][order[band]];
                  b = win[type][k + 9] * band0[k + 9][order[band]] - win[type][k + 18] * band0[8 - k][order[band]];
                  work[k + 9] = a - b * tantab_l[3 + k + 9];
                  work[k + 18] = a * tantab_l[3 + k + 9] + b;
                }
                mdct_long(mdct_enc, mdct_encPos, work);
              }
            }
            if (type != Encoder.SHORT_TYPE && band != 0) {
              for (var k = 7; k >= 0; --k) {
                var bu, bd;
                bu = mdct_enc[mdct_encPos + k] * ca[20 + k] + mdct_enc[mdct_encPos + -1 - k] * cs[28 + k];
                bd = mdct_enc[mdct_encPos + k] * cs[28 + k] - mdct_enc[mdct_encPos + -1 - k] * ca[20 + k];
                mdct_enc[mdct_encPos + -1 - k] = bu;
                mdct_enc[mdct_encPos + k] = bd;
              }
            }
          }
        }
        wk = w1;
        wkPos = 286;
        if (gfc.mode_gr == 1) {
          for (var i = 0; i < 18; i++) {
            System.arraycopy(
              gfc.sb_sample[ch][1][i],
              0,
              gfc.sb_sample[ch][0][i],
              0,
              32
            );
          }
        }
      }
    };
  }
  function III_psy_ratio() {
    this.thm = new III_psy_xmin();
    this.en = new III_psy_xmin();
  }
  Encoder.ENCDELAY = 576;
  Encoder.POSTDELAY = 1152;
  Encoder.MDCTDELAY = 48;
  Encoder.FFTOFFSET = 224 + Encoder.MDCTDELAY;
  Encoder.DECDELAY = 528;
  Encoder.SBLIMIT = 32;
  Encoder.CBANDS = 64;
  Encoder.SBPSY_l = 21;
  Encoder.SBPSY_s = 12;
  Encoder.SBMAX_l = 22;
  Encoder.SBMAX_s = 13;
  Encoder.PSFB21 = 6;
  Encoder.PSFB12 = 6;
  Encoder.BLKSIZE = 1024;
  Encoder.HBLKSIZE = Encoder.BLKSIZE / 2 + 1;
  Encoder.BLKSIZE_s = 256;
  Encoder.HBLKSIZE_s = Encoder.BLKSIZE_s / 2 + 1;
  Encoder.NORM_TYPE = 0;
  Encoder.START_TYPE = 1;
  Encoder.SHORT_TYPE = 2;
  Encoder.STOP_TYPE = 3;
  Encoder.MPG_MD_LR_LR = 0;
  Encoder.MPG_MD_LR_I = 1;
  Encoder.MPG_MD_MS_LR = 2;
  Encoder.MPG_MD_MS_I = 3;
  Encoder.fircoef = [
    -0.0207887 * 5,
    -0.0378413 * 5,
    -0.0432472 * 5,
    -0.031183 * 5,
    779609e-23 * 5,
    0.0467745 * 5,
    0.10091 * 5,
    0.151365 * 5,
    0.187098 * 5
  ];
  function Encoder() {
    var FFTOFFSET = Encoder.FFTOFFSET;
    var MPG_MD_MS_LR = Encoder.MPG_MD_MS_LR;
    var bs = null;
    this.psy = null;
    var psy = null;
    var vbr = null;
    var qupvt = null;
    this.setModules = function(_bs, _psy, _qupvt, _vbr) {
      bs = _bs;
      this.psy = _psy;
      psy = _psy;
      vbr = _vbr;
      qupvt = _qupvt;
    };
    var newMDCT = new NewMDCT();
    function adjust_ATH(gfc) {
      var gr2_max, max_pow;
      if (gfc.ATH.useAdjust == 0) {
        gfc.ATH.adjust = 1;
        return;
      }
      max_pow = gfc.loudness_sq[0][0];
      gr2_max = gfc.loudness_sq[1][0];
      if (gfc.channels_out == 2) {
        max_pow += gfc.loudness_sq[0][1];
        gr2_max += gfc.loudness_sq[1][1];
      } else {
        max_pow += max_pow;
        gr2_max += gr2_max;
      }
      if (gfc.mode_gr == 2) {
        max_pow = Math.max(max_pow, gr2_max);
      }
      max_pow *= 0.5;
      max_pow *= gfc.ATH.aaSensitivityP;
      if (max_pow > 0.03125) {
        if (gfc.ATH.adjust >= 1) {
          gfc.ATH.adjust = 1;
        } else {
          if (gfc.ATH.adjust < gfc.ATH.adjustLimit) {
            gfc.ATH.adjust = gfc.ATH.adjustLimit;
          }
        }
        gfc.ATH.adjustLimit = 1;
      } else {
        var adj_lim_new = 31.98 * max_pow + 625e-6;
        if (gfc.ATH.adjust >= adj_lim_new) {
          gfc.ATH.adjust *= adj_lim_new * 0.075 + 0.925;
          if (gfc.ATH.adjust < adj_lim_new) {
            gfc.ATH.adjust = adj_lim_new;
          }
        } else {
          if (gfc.ATH.adjustLimit >= adj_lim_new) {
            gfc.ATH.adjust = adj_lim_new;
          } else {
            if (gfc.ATH.adjust < gfc.ATH.adjustLimit) {
              gfc.ATH.adjust = gfc.ATH.adjustLimit;
            }
          }
        }
        gfc.ATH.adjustLimit = adj_lim_new;
      }
    }
    function updateStats(gfc) {
      var gr, ch;
      gfc.bitrate_stereoMode_Hist[gfc.bitrate_index][4]++;
      gfc.bitrate_stereoMode_Hist[15][4]++;
      if (gfc.channels_out == 2) {
        gfc.bitrate_stereoMode_Hist[gfc.bitrate_index][gfc.mode_ext]++;
        gfc.bitrate_stereoMode_Hist[15][gfc.mode_ext]++;
      }
      for (gr = 0; gr < gfc.mode_gr; ++gr) {
        for (ch = 0; ch < gfc.channels_out; ++ch) {
          var bt = gfc.l3_side.tt[gr][ch].block_type | 0;
          if (gfc.l3_side.tt[gr][ch].mixed_block_flag != 0)
            bt = 4;
          gfc.bitrate_blockType_Hist[gfc.bitrate_index][bt]++;
          gfc.bitrate_blockType_Hist[gfc.bitrate_index][5]++;
          gfc.bitrate_blockType_Hist[15][bt]++;
          gfc.bitrate_blockType_Hist[15][5]++;
        }
      }
    }
    function lame_encode_frame_init(gfp, inbuf) {
      var gfc = gfp.internal_flags;
      var ch, gr;
      if (gfc.lame_encode_frame_init == 0) {
        var i, j;
        var primebuff0 = new_float(286 + 1152 + 576);
        var primebuff1 = new_float(286 + 1152 + 576);
        gfc.lame_encode_frame_init = 1;
        for (i = 0, j = 0; i < 286 + 576 * (1 + gfc.mode_gr); ++i) {
          if (i < 576 * gfc.mode_gr) {
            primebuff0[i] = 0;
            if (gfc.channels_out == 2)
              primebuff1[i] = 0;
          } else {
            primebuff0[i] = inbuf[0][j];
            if (gfc.channels_out == 2)
              primebuff1[i] = inbuf[1][j];
            ++j;
          }
        }
        for (gr = 0; gr < gfc.mode_gr; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            gfc.l3_side.tt[gr][ch].block_type = Encoder.SHORT_TYPE;
          }
        }
        newMDCT.mdct_sub48(gfc, primebuff0, primebuff1);
      }
    }
    this.lame_encode_mp3_frame = function(gfp, inbuf_l, inbuf_r, mp3buf, mp3bufPos, mp3buf_size) {
      var mp3count;
      var masking_LR = new_array_n([2, 2]);
      masking_LR[0][0] = new III_psy_ratio();
      masking_LR[0][1] = new III_psy_ratio();
      masking_LR[1][0] = new III_psy_ratio();
      masking_LR[1][1] = new III_psy_ratio();
      var masking_MS = new_array_n([2, 2]);
      masking_MS[0][0] = new III_psy_ratio();
      masking_MS[0][1] = new III_psy_ratio();
      masking_MS[1][0] = new III_psy_ratio();
      masking_MS[1][1] = new III_psy_ratio();
      var masking;
      var inbuf = [null, null];
      var gfc = gfp.internal_flags;
      var tot_ener = new_float_n([2, 4]);
      var ms_ener_ratio = [0.5, 0.5];
      var pe = [[0, 0], [0, 0]];
      var pe_MS = [[0, 0], [0, 0]];
      var pe_use;
      var ch, gr;
      inbuf[0] = inbuf_l;
      inbuf[1] = inbuf_r;
      if (gfc.lame_encode_frame_init == 0) {
        lame_encode_frame_init(gfp, inbuf);
      }
      gfc.padding = 0;
      if ((gfc.slot_lag -= gfc.frac_SpF) < 0) {
        gfc.slot_lag += gfp.out_samplerate;
        gfc.padding = 1;
      }
      if (gfc.psymodel != 0) {
        var ret;
        var bufp = [null, null];
        var bufpPos = 0;
        var blocktype = new_int(2);
        for (gr = 0; gr < gfc.mode_gr; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            bufp[ch] = inbuf[ch];
            bufpPos = 576 + gr * 576 - Encoder.FFTOFFSET;
          }
          if (gfp.VBR == VbrMode.vbr_mtrh || gfp.VBR == VbrMode.vbr_mt) {
            ret = psy.L3psycho_anal_vbr(
              gfp,
              bufp,
              bufpPos,
              gr,
              masking_LR,
              masking_MS,
              pe[gr],
              pe_MS[gr],
              tot_ener[gr],
              blocktype
            );
          } else {
            ret = psy.L3psycho_anal_ns(
              gfp,
              bufp,
              bufpPos,
              gr,
              masking_LR,
              masking_MS,
              pe[gr],
              pe_MS[gr],
              tot_ener[gr],
              blocktype
            );
          }
          if (ret != 0)
            return -4;
          if (gfp.mode == MPEGMode.JOINT_STEREO) {
            ms_ener_ratio[gr] = tot_ener[gr][2] + tot_ener[gr][3];
            if (ms_ener_ratio[gr] > 0)
              ms_ener_ratio[gr] = tot_ener[gr][3] / ms_ener_ratio[gr];
          }
          for (ch = 0; ch < gfc.channels_out; ch++) {
            var cod_info = gfc.l3_side.tt[gr][ch];
            cod_info.block_type = blocktype[ch];
            cod_info.mixed_block_flag = 0;
          }
        }
      } else {
        for (gr = 0; gr < gfc.mode_gr; gr++)
          for (ch = 0; ch < gfc.channels_out; ch++) {
            gfc.l3_side.tt[gr][ch].block_type = Encoder.NORM_TYPE;
            gfc.l3_side.tt[gr][ch].mixed_block_flag = 0;
            pe_MS[gr][ch] = pe[gr][ch] = 700;
          }
      }
      adjust_ATH(gfc);
      newMDCT.mdct_sub48(gfc, inbuf[0], inbuf[1]);
      gfc.mode_ext = Encoder.MPG_MD_LR_LR;
      if (gfp.force_ms) {
        gfc.mode_ext = Encoder.MPG_MD_MS_LR;
      } else if (gfp.mode == MPEGMode.JOINT_STEREO) {
        var sum_pe_MS = 0;
        var sum_pe_LR = 0;
        for (gr = 0; gr < gfc.mode_gr; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            sum_pe_MS += pe_MS[gr][ch];
            sum_pe_LR += pe[gr][ch];
          }
        }
        if (sum_pe_MS <= 1 * sum_pe_LR) {
          var gi0 = gfc.l3_side.tt[0];
          var gi1 = gfc.l3_side.tt[gfc.mode_gr - 1];
          if (gi0[0].block_type == gi0[1].block_type && gi1[0].block_type == gi1[1].block_type) {
            gfc.mode_ext = Encoder.MPG_MD_MS_LR;
          }
        }
      }
      if (gfc.mode_ext == MPG_MD_MS_LR) {
        masking = masking_MS;
        pe_use = pe_MS;
      } else {
        masking = masking_LR;
        pe_use = pe;
      }
      if (gfp.analysis && gfc.pinfo != null) {
        for (gr = 0; gr < gfc.mode_gr; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            gfc.pinfo.ms_ratio[gr] = gfc.ms_ratio[gr];
            gfc.pinfo.ms_ener_ratio[gr] = ms_ener_ratio[gr];
            gfc.pinfo.blocktype[gr][ch] = gfc.l3_side.tt[gr][ch].block_type;
            gfc.pinfo.pe[gr][ch] = pe_use[gr][ch];
            System.arraycopy(
              gfc.l3_side.tt[gr][ch].xr,
              0,
              gfc.pinfo.xr[gr][ch],
              0,
              576
            );
            if (gfc.mode_ext == MPG_MD_MS_LR) {
              gfc.pinfo.ers[gr][ch] = gfc.pinfo.ers[gr][ch + 2];
              System.arraycopy(
                gfc.pinfo.energy[gr][ch + 2],
                0,
                gfc.pinfo.energy[gr][ch],
                0,
                gfc.pinfo.energy[gr][ch].length
              );
            }
          }
        }
      }
      if (gfp.VBR == VbrMode.vbr_off || gfp.VBR == VbrMode.vbr_abr) {
        var i;
        var f;
        for (i = 0; i < 18; i++)
          gfc.nsPsy.pefirbuf[i] = gfc.nsPsy.pefirbuf[i + 1];
        f = 0;
        for (gr = 0; gr < gfc.mode_gr; gr++)
          for (ch = 0; ch < gfc.channels_out; ch++)
            f += pe_use[gr][ch];
        gfc.nsPsy.pefirbuf[18] = f;
        f = gfc.nsPsy.pefirbuf[9];
        for (i = 0; i < 9; i++)
          f += (gfc.nsPsy.pefirbuf[i] + gfc.nsPsy.pefirbuf[18 - i]) * Encoder.fircoef[i];
        f = 670 * 5 * gfc.mode_gr * gfc.channels_out / f;
        for (gr = 0; gr < gfc.mode_gr; gr++) {
          for (ch = 0; ch < gfc.channels_out; ch++) {
            pe_use[gr][ch] *= f;
          }
        }
      }
      gfc.iteration_loop.iteration_loop(gfp, pe_use, ms_ener_ratio, masking);
      bs.format_bitstream(gfp);
      mp3count = bs.copy_buffer(gfc, mp3buf, mp3bufPos, mp3buf_size, 1);
      if (gfp.bWriteVbrTag)
        vbr.addVbrFrame(gfp);
      if (gfp.analysis && gfc.pinfo != null) {
        for (ch = 0; ch < gfc.channels_out; ch++) {
          var j;
          for (j = 0; j < FFTOFFSET; j++)
            gfc.pinfo.pcmdata[ch][j] = gfc.pinfo.pcmdata[ch][j + gfp.framesize];
          for (j = FFTOFFSET; j < 1600; j++) {
            gfc.pinfo.pcmdata[ch][j] = inbuf[ch][j - FFTOFFSET];
          }
        }
        qupvt.set_frame_pinfo(gfp, masking);
      }
      updateStats(gfc);
      return mp3count;
    };
  }
  function VBRSeekInfo() {
    this.sum = 0;
    this.seen = 0;
    this.want = 0;
    this.pos = 0;
    this.size = 0;
    this.bag = null;
    this.nVbrNumFrames = 0;
    this.nBytesWritten = 0;
    this.TotalFrameSize = 0;
  }
  function IIISideInfo() {
    this.tt = [[null, null], [null, null]];
    this.main_data_begin = 0;
    this.private_bits = 0;
    this.resvDrain_pre = 0;
    this.resvDrain_post = 0;
    this.scfsi = [new_int(4), new_int(4)];
    for (var gr = 0; gr < 2; gr++) {
      for (var ch = 0; ch < 2; ch++) {
        this.tt[gr][ch] = new GrInfo();
      }
    }
  }
  function NsPsy() {
    this.last_en_subshort = new_float_n([4, 9]);
    this.lastAttacks = new_int(4);
    this.pefirbuf = new_float(19);
    this.longfact = new_float(Encoder.SBMAX_l);
    this.shortfact = new_float(Encoder.SBMAX_s);
    this.attackthre = 0;
    this.attackthre_s = 0;
  }
  function III_psy_xmin() {
    this.l = new_float(Encoder.SBMAX_l);
    this.s = new_float_n([Encoder.SBMAX_s, 3]);
    var self = this;
    this.assign = function(iii_psy_xmin) {
      System.arraycopy(iii_psy_xmin.l, 0, self.l, 0, Encoder.SBMAX_l);
      for (var i = 0; i < Encoder.SBMAX_s; i++) {
        for (var j = 0; j < 3; j++) {
          self.s[i][j] = iii_psy_xmin.s[i][j];
        }
      }
    };
  }
  LameInternalFlags.MFSIZE = 3 * 1152 + Encoder.ENCDELAY - Encoder.MDCTDELAY;
  LameInternalFlags.MAX_HEADER_BUF = 256;
  LameInternalFlags.MAX_BITS_PER_CHANNEL = 4095;
  LameInternalFlags.MAX_BITS_PER_GRANULE = 7680;
  LameInternalFlags.BPC = 320;
  function LameInternalFlags() {
    var MAX_HEADER_LEN = 40;
    this.Class_ID = 0;
    this.lame_encode_frame_init = 0;
    this.iteration_init_init = 0;
    this.fill_buffer_resample_init = 0;
    this.mfbuf = new_float_n([2, LameInternalFlags.MFSIZE]);
    this.mode_gr = 0;
    this.channels_in = 0;
    this.channels_out = 0;
    this.resample_ratio = 0;
    this.mf_samples_to_encode = 0;
    this.mf_size = 0;
    this.VBR_min_bitrate = 0;
    this.VBR_max_bitrate = 0;
    this.bitrate_index = 0;
    this.samplerate_index = 0;
    this.mode_ext = 0;
    this.lowpass1 = 0;
    this.lowpass2 = 0;
    this.highpass1 = 0;
    this.highpass2 = 0;
    this.noise_shaping = 0;
    this.noise_shaping_amp = 0;
    this.substep_shaping = 0;
    this.psymodel = 0;
    this.noise_shaping_stop = 0;
    this.subblock_gain = 0;
    this.use_best_huffman = 0;
    this.full_outer_loop = 0;
    this.l3_side = new IIISideInfo();
    this.ms_ratio = new_float(2);
    this.padding = 0;
    this.frac_SpF = 0;
    this.slot_lag = 0;
    this.tag_spec = null;
    this.nMusicCRC = 0;
    this.OldValue = new_int(2);
    this.CurrentStep = new_int(2);
    this.masking_lower = 0;
    this.bv_scf = new_int(576);
    this.pseudohalf = new_int(L3Side.SFBMAX);
    this.sfb21_extra = false;
    this.inbuf_old = new Array(2);
    this.blackfilt = new Array(2 * LameInternalFlags.BPC + 1);
    this.itime = new_double(2);
    this.sideinfo_len = 0;
    this.sb_sample = new_float_n([2, 2, 18, Encoder.SBLIMIT]);
    this.amp_filter = new_float(32);
    function Header() {
      this.write_timing = 0;
      this.ptr = 0;
      this.buf = new_byte(MAX_HEADER_LEN);
    }
    this.header = new Array(LameInternalFlags.MAX_HEADER_BUF);
    this.h_ptr = 0;
    this.w_ptr = 0;
    this.ancillary_flag = 0;
    this.ResvSize = 0;
    this.ResvMax = 0;
    this.scalefac_band = new ScaleFac();
    this.minval_l = new_float(Encoder.CBANDS);
    this.minval_s = new_float(Encoder.CBANDS);
    this.nb_1 = new_float_n([4, Encoder.CBANDS]);
    this.nb_2 = new_float_n([4, Encoder.CBANDS]);
    this.nb_s1 = new_float_n([4, Encoder.CBANDS]);
    this.nb_s2 = new_float_n([4, Encoder.CBANDS]);
    this.s3_ss = null;
    this.s3_ll = null;
    this.decay = 0;
    this.thm = new Array(4);
    this.en = new Array(4);
    this.tot_ener = new_float(4);
    this.loudness_sq = new_float_n([2, 2]);
    this.loudness_sq_save = new_float(2);
    this.mld_l = new_float(Encoder.SBMAX_l);
    this.mld_s = new_float(Encoder.SBMAX_s);
    this.bm_l = new_int(Encoder.SBMAX_l);
    this.bo_l = new_int(Encoder.SBMAX_l);
    this.bm_s = new_int(Encoder.SBMAX_s);
    this.bo_s = new_int(Encoder.SBMAX_s);
    this.npart_l = 0;
    this.npart_s = 0;
    this.s3ind = new_int_n([Encoder.CBANDS, 2]);
    this.s3ind_s = new_int_n([Encoder.CBANDS, 2]);
    this.numlines_s = new_int(Encoder.CBANDS);
    this.numlines_l = new_int(Encoder.CBANDS);
    this.rnumlines_l = new_float(Encoder.CBANDS);
    this.mld_cb_l = new_float(Encoder.CBANDS);
    this.mld_cb_s = new_float(Encoder.CBANDS);
    this.numlines_s_num1 = 0;
    this.numlines_l_num1 = 0;
    this.pe = new_float(4);
    this.ms_ratio_s_old = 0;
    this.ms_ratio_l_old = 0;
    this.ms_ener_ratio_old = 0;
    this.blocktype_old = new_int(2);
    this.nsPsy = new NsPsy();
    this.VBR_seek_table = new VBRSeekInfo();
    this.ATH = null;
    this.PSY = null;
    this.nogap_total = 0;
    this.nogap_current = 0;
    this.decode_on_the_fly = true;
    this.findReplayGain = true;
    this.findPeakSample = true;
    this.PeakSample = 0;
    this.RadioGain = 0;
    this.AudiophileGain = 0;
    this.rgdata = null;
    this.noclipGainChange = 0;
    this.noclipScale = 0;
    this.bitrate_stereoMode_Hist = new_int_n([16, 4 + 1]);
    this.bitrate_blockType_Hist = new_int_n([16, 4 + 1 + 1]);
    this.pinfo = null;
    this.hip = null;
    this.in_buffer_nsamples = 0;
    this.in_buffer_0 = null;
    this.in_buffer_1 = null;
    this.iteration_loop = null;
    for (var i = 0; i < this.en.length; i++) {
      this.en[i] = new III_psy_xmin();
    }
    for (var i = 0; i < this.thm.length; i++) {
      this.thm[i] = new III_psy_xmin();
    }
    for (var i = 0; i < this.header.length; i++) {
      this.header[i] = new Header();
    }
  }
  function FFT() {
    var window = new_float(Encoder.BLKSIZE);
    var window_s = new_float(Encoder.BLKSIZE_s / 2);
    var costab = [
      0.9238795325112867,
      0.3826834323650898,
      0.9951847266721969,
      0.0980171403295606,
      0.9996988186962042,
      0.02454122852291229,
      0.9999811752826011,
      0.006135884649154475
    ];
    function fht(fz, fzPos, n) {
      var tri = 0;
      var k4;
      var fi;
      var gi;
      n <<= 1;
      var fn = fzPos + n;
      k4 = 4;
      do {
        var s1, c1;
        var i, k1, k2, k3, kx;
        kx = k4 >> 1;
        k1 = k4;
        k2 = k4 << 1;
        k3 = k2 + k1;
        k4 = k2 << 1;
        fi = fzPos;
        gi = fi + kx;
        do {
          var f0, f1, f2, f3;
          f1 = fz[fi + 0] - fz[fi + k1];
          f0 = fz[fi + 0] + fz[fi + k1];
          f3 = fz[fi + k2] - fz[fi + k3];
          f2 = fz[fi + k2] + fz[fi + k3];
          fz[fi + k2] = f0 - f2;
          fz[fi + 0] = f0 + f2;
          fz[fi + k3] = f1 - f3;
          fz[fi + k1] = f1 + f3;
          f1 = fz[gi + 0] - fz[gi + k1];
          f0 = fz[gi + 0] + fz[gi + k1];
          f3 = Util.SQRT2 * fz[gi + k3];
          f2 = Util.SQRT2 * fz[gi + k2];
          fz[gi + k2] = f0 - f2;
          fz[gi + 0] = f0 + f2;
          fz[gi + k3] = f1 - f3;
          fz[gi + k1] = f1 + f3;
          gi += k4;
          fi += k4;
        } while (fi < fn);
        c1 = costab[tri + 0];
        s1 = costab[tri + 1];
        for (i = 1; i < kx; i++) {
          var c2, s2;
          c2 = 1 - 2 * s1 * s1;
          s2 = 2 * s1 * c1;
          fi = fzPos + i;
          gi = fzPos + k1 - i;
          do {
            var a, b, g0, f0, f1, g1, f2, g2, f3, g3;
            b = s2 * fz[fi + k1] - c2 * fz[gi + k1];
            a = c2 * fz[fi + k1] + s2 * fz[gi + k1];
            f1 = fz[fi + 0] - a;
            f0 = fz[fi + 0] + a;
            g1 = fz[gi + 0] - b;
            g0 = fz[gi + 0] + b;
            b = s2 * fz[fi + k3] - c2 * fz[gi + k3];
            a = c2 * fz[fi + k3] + s2 * fz[gi + k3];
            f3 = fz[fi + k2] - a;
            f2 = fz[fi + k2] + a;
            g3 = fz[gi + k2] - b;
            g2 = fz[gi + k2] + b;
            b = s1 * f2 - c1 * g3;
            a = c1 * f2 + s1 * g3;
            fz[fi + k2] = f0 - a;
            fz[fi + 0] = f0 + a;
            fz[gi + k3] = g1 - b;
            fz[gi + k1] = g1 + b;
            b = c1 * g2 - s1 * f3;
            a = s1 * g2 + c1 * f3;
            fz[gi + k2] = g0 - a;
            fz[gi + 0] = g0 + a;
            fz[fi + k3] = f1 - b;
            fz[fi + k1] = f1 + b;
            gi += k4;
            fi += k4;
          } while (fi < fn);
          c2 = c1;
          c1 = c2 * costab[tri + 0] - s1 * costab[tri + 1];
          s1 = c2 * costab[tri + 1] + s1 * costab[tri + 0];
        }
        tri += 2;
      } while (k4 < n);
    }
    var rv_tbl = [
      0,
      128,
      64,
      192,
      32,
      160,
      96,
      224,
      16,
      144,
      80,
      208,
      48,
      176,
      112,
      240,
      8,
      136,
      72,
      200,
      40,
      168,
      104,
      232,
      24,
      152,
      88,
      216,
      56,
      184,
      120,
      248,
      4,
      132,
      68,
      196,
      36,
      164,
      100,
      228,
      20,
      148,
      84,
      212,
      52,
      180,
      116,
      244,
      12,
      140,
      76,
      204,
      44,
      172,
      108,
      236,
      28,
      156,
      92,
      220,
      60,
      188,
      124,
      252,
      2,
      130,
      66,
      194,
      34,
      162,
      98,
      226,
      18,
      146,
      82,
      210,
      50,
      178,
      114,
      242,
      10,
      138,
      74,
      202,
      42,
      170,
      106,
      234,
      26,
      154,
      90,
      218,
      58,
      186,
      122,
      250,
      6,
      134,
      70,
      198,
      38,
      166,
      102,
      230,
      22,
      150,
      86,
      214,
      54,
      182,
      118,
      246,
      14,
      142,
      78,
      206,
      46,
      174,
      110,
      238,
      30,
      158,
      94,
      222,
      62,
      190,
      126,
      254
    ];
    this.fft_short = function(gfc, x_real, chn, buffer, bufPos) {
      for (var b = 0; b < 3; b++) {
        var x = Encoder.BLKSIZE_s / 2;
        var k = 65535 & 576 / 3 * (b + 1);
        var j = Encoder.BLKSIZE_s / 8 - 1;
        do {
          var f0, f1, f2, f3, w;
          var i = rv_tbl[j << 2] & 255;
          f0 = window_s[i] * buffer[chn][bufPos + i + k];
          w = window_s[127 - i] * buffer[chn][bufPos + i + k + 128];
          f1 = f0 - w;
          f0 = f0 + w;
          f2 = window_s[i + 64] * buffer[chn][bufPos + i + k + 64];
          w = window_s[63 - i] * buffer[chn][bufPos + i + k + 192];
          f3 = f2 - w;
          f2 = f2 + w;
          x -= 4;
          x_real[b][x + 0] = f0 + f2;
          x_real[b][x + 2] = f0 - f2;
          x_real[b][x + 1] = f1 + f3;
          x_real[b][x + 3] = f1 - f3;
          f0 = window_s[i + 1] * buffer[chn][bufPos + i + k + 1];
          w = window_s[126 - i] * buffer[chn][bufPos + i + k + 129];
          f1 = f0 - w;
          f0 = f0 + w;
          f2 = window_s[i + 65] * buffer[chn][bufPos + i + k + 65];
          w = window_s[62 - i] * buffer[chn][bufPos + i + k + 193];
          f3 = f2 - w;
          f2 = f2 + w;
          x_real[b][x + Encoder.BLKSIZE_s / 2 + 0] = f0 + f2;
          x_real[b][x + Encoder.BLKSIZE_s / 2 + 2] = f0 - f2;
          x_real[b][x + Encoder.BLKSIZE_s / 2 + 1] = f1 + f3;
          x_real[b][x + Encoder.BLKSIZE_s / 2 + 3] = f1 - f3;
        } while (--j >= 0);
        fht(x_real[b], x, Encoder.BLKSIZE_s / 2);
      }
    };
    this.fft_long = function(gfc, y, chn, buffer, bufPos) {
      var jj = Encoder.BLKSIZE / 8 - 1;
      var x = Encoder.BLKSIZE / 2;
      do {
        var f0, f1, f2, f3, w;
        var i = rv_tbl[jj] & 255;
        f0 = window[i] * buffer[chn][bufPos + i];
        w = window[i + 512] * buffer[chn][bufPos + i + 512];
        f1 = f0 - w;
        f0 = f0 + w;
        f2 = window[i + 256] * buffer[chn][bufPos + i + 256];
        w = window[i + 768] * buffer[chn][bufPos + i + 768];
        f3 = f2 - w;
        f2 = f2 + w;
        x -= 4;
        y[x + 0] = f0 + f2;
        y[x + 2] = f0 - f2;
        y[x + 1] = f1 + f3;
        y[x + 3] = f1 - f3;
        f0 = window[i + 1] * buffer[chn][bufPos + i + 1];
        w = window[i + 513] * buffer[chn][bufPos + i + 513];
        f1 = f0 - w;
        f0 = f0 + w;
        f2 = window[i + 257] * buffer[chn][bufPos + i + 257];
        w = window[i + 769] * buffer[chn][bufPos + i + 769];
        f3 = f2 - w;
        f2 = f2 + w;
        y[x + Encoder.BLKSIZE / 2 + 0] = f0 + f2;
        y[x + Encoder.BLKSIZE / 2 + 2] = f0 - f2;
        y[x + Encoder.BLKSIZE / 2 + 1] = f1 + f3;
        y[x + Encoder.BLKSIZE / 2 + 3] = f1 - f3;
      } while (--jj >= 0);
      fht(y, x, Encoder.BLKSIZE / 2);
    };
    this.init_fft = function(gfc) {
      for (var i = 0; i < Encoder.BLKSIZE; i++)
        window[i] = 0.42 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / Encoder.BLKSIZE) + 0.08 * Math.cos(4 * Math.PI * (i + 0.5) / Encoder.BLKSIZE);
      for (var i = 0; i < Encoder.BLKSIZE_s / 2; i++)
        window_s[i] = 0.5 * (1 - Math.cos(2 * Math.PI * (i + 0.5) / Encoder.BLKSIZE_s));
    };
  }
  function PsyModel() {
    var fft = new FFT();
    var LOG10 = 2.302585092994046;
    var rpelev = 2;
    var rpelev2 = 16;
    var rpelev_s = 2;
    var rpelev2_s = 16;
    var DELBARK = 0.34;
    var VO_SCALE = 1 / (14752 * 14752) / (Encoder.BLKSIZE / 2);
    var temporalmask_sustain_sec = 0.01;
    var NS_PREECHO_ATT0 = 0.8;
    var NS_PREECHO_ATT1 = 0.6;
    var NS_PREECHO_ATT2 = 0.3;
    var NS_MSFIX = 3.5;
    var NSATTACKTHRE = 4.4;
    var NSATTACKTHRE_S = 25;
    var NSFIRLEN = 21;
    var LN_TO_LOG10 = 0.2302585093;
    function NON_LINEAR_SCALE_ENERGY(x) {
      return x;
    }
    function psycho_loudness_approx(energy, gfc) {
      var loudness_power = 0;
      for (var i = 0; i < Encoder.BLKSIZE / 2; ++i)
        loudness_power += energy[i] * gfc.ATH.eql_w[i];
      loudness_power *= VO_SCALE;
      return loudness_power;
    }
    function compute_ffts(gfp, fftenergy, fftenergy_s, wsamp_l, wsamp_lPos, wsamp_s, wsamp_sPos, gr_out, chn, buffer, bufPos) {
      var gfc = gfp.internal_flags;
      if (chn < 2) {
        fft.fft_long(gfc, wsamp_l[wsamp_lPos], chn, buffer, bufPos);
        fft.fft_short(gfc, wsamp_s[wsamp_sPos], chn, buffer, bufPos);
      } else if (chn == 2) {
        for (var j = Encoder.BLKSIZE - 1; j >= 0; --j) {
          var l = wsamp_l[wsamp_lPos + 0][j];
          var r = wsamp_l[wsamp_lPos + 1][j];
          wsamp_l[wsamp_lPos + 0][j] = (l + r) * Util.SQRT2 * 0.5;
          wsamp_l[wsamp_lPos + 1][j] = (l - r) * Util.SQRT2 * 0.5;
        }
        for (var b = 2; b >= 0; --b) {
          for (var j = Encoder.BLKSIZE_s - 1; j >= 0; --j) {
            var l = wsamp_s[wsamp_sPos + 0][b][j];
            var r = wsamp_s[wsamp_sPos + 1][b][j];
            wsamp_s[wsamp_sPos + 0][b][j] = (l + r) * Util.SQRT2 * 0.5;
            wsamp_s[wsamp_sPos + 1][b][j] = (l - r) * Util.SQRT2 * 0.5;
          }
        }
      }
      fftenergy[0] = NON_LINEAR_SCALE_ENERGY(wsamp_l[wsamp_lPos + 0][0]);
      fftenergy[0] *= fftenergy[0];
      for (var j = Encoder.BLKSIZE / 2 - 1; j >= 0; --j) {
        var re = wsamp_l[wsamp_lPos + 0][Encoder.BLKSIZE / 2 - j];
        var im = wsamp_l[wsamp_lPos + 0][Encoder.BLKSIZE / 2 + j];
        fftenergy[Encoder.BLKSIZE / 2 - j] = NON_LINEAR_SCALE_ENERGY((re * re + im * im) * 0.5);
      }
      for (var b = 2; b >= 0; --b) {
        fftenergy_s[b][0] = wsamp_s[wsamp_sPos + 0][b][0];
        fftenergy_s[b][0] *= fftenergy_s[b][0];
        for (var j = Encoder.BLKSIZE_s / 2 - 1; j >= 0; --j) {
          var re = wsamp_s[wsamp_sPos + 0][b][Encoder.BLKSIZE_s / 2 - j];
          var im = wsamp_s[wsamp_sPos + 0][b][Encoder.BLKSIZE_s / 2 + j];
          fftenergy_s[b][Encoder.BLKSIZE_s / 2 - j] = NON_LINEAR_SCALE_ENERGY((re * re + im * im) * 0.5);
        }
      }
      {
        var totalenergy = 0;
        for (var j = 11; j < Encoder.HBLKSIZE; j++)
          totalenergy += fftenergy[j];
        gfc.tot_ener[chn] = totalenergy;
      }
      if (gfp.analysis) {
        for (var j = 0; j < Encoder.HBLKSIZE; j++) {
          gfc.pinfo.energy[gr_out][chn][j] = gfc.pinfo.energy_save[chn][j];
          gfc.pinfo.energy_save[chn][j] = fftenergy[j];
        }
        gfc.pinfo.pe[gr_out][chn] = gfc.pe[chn];
      }
      if (gfp.athaa_loudapprox == 2 && chn < 2) {
        gfc.loudness_sq[gr_out][chn] = gfc.loudness_sq_save[chn];
        gfc.loudness_sq_save[chn] = psycho_loudness_approx(fftenergy, gfc);
      }
    }
    var I1LIMIT = 8;
    var I2LIMIT = 23;
    var MLIMIT = 15;
    var ma_max_i1;
    var ma_max_i2;
    var ma_max_m;
    var tab = [
      1,
      0.79433,
      0.63096,
      0.63096,
      0.63096,
      0.63096,
      0.63096,
      0.25119,
      0.11749
    ];
    function init_mask_add_max_values() {
      ma_max_i1 = Math.pow(10, (I1LIMIT + 1) / 16);
      ma_max_i2 = Math.pow(10, (I2LIMIT + 1) / 16);
      ma_max_m = Math.pow(10, MLIMIT / 10);
    }
    var table1 = [
      3.3246 * 3.3246,
      3.23837 * 3.23837,
      3.15437 * 3.15437,
      3.00412 * 3.00412,
      2.86103 * 2.86103,
      2.65407 * 2.65407,
      2.46209 * 2.46209,
      2.284 * 2.284,
      2.11879 * 2.11879,
      1.96552 * 1.96552,
      1.82335 * 1.82335,
      1.69146 * 1.69146,
      1.56911 * 1.56911,
      1.46658 * 1.46658,
      1.37074 * 1.37074,
      1.31036 * 1.31036,
      1.25264 * 1.25264,
      1.20648 * 1.20648,
      1.16203 * 1.16203,
      1.12765 * 1.12765,
      1.09428 * 1.09428,
      1.0659 * 1.0659,
      1.03826 * 1.03826,
      1.01895 * 1.01895,
      1
    ];
    var table2 = [
      1.33352 * 1.33352,
      1.35879 * 1.35879,
      1.38454 * 1.38454,
      1.39497 * 1.39497,
      1.40548 * 1.40548,
      1.3537 * 1.3537,
      1.30382 * 1.30382,
      1.22321 * 1.22321,
      1.14758 * 1.14758,
      1
    ];
    var table3 = [
      2.35364 * 2.35364,
      2.29259 * 2.29259,
      2.23313 * 2.23313,
      2.12675 * 2.12675,
      2.02545 * 2.02545,
      1.87894 * 1.87894,
      1.74303 * 1.74303,
      1.61695 * 1.61695,
      1.49999 * 1.49999,
      1.39148 * 1.39148,
      1.29083 * 1.29083,
      1.19746 * 1.19746,
      1.11084 * 1.11084,
      1.03826 * 1.03826
    ];
    function mask_add(m1, m2, kk, b, gfc, shortblock) {
      var ratio;
      if (m2 > m1) {
        if (m2 < m1 * ma_max_i2)
          ratio = m2 / m1;
        else
          return m1 + m2;
      } else {
        if (m1 >= m2 * ma_max_i2)
          return m1 + m2;
        ratio = m1 / m2;
      }
      m1 += m2;
      if (b + 3 <= 3 + 3) {
        if (ratio >= ma_max_i1) {
          return m1;
        }
        var i = 0 | Util.FAST_LOG10_X(ratio, 16);
        return m1 * table2[i];
      }
      var i = 0 | Util.FAST_LOG10_X(ratio, 16);
      if (shortblock != 0) {
        m2 = gfc.ATH.cb_s[kk] * gfc.ATH.adjust;
      } else {
        m2 = gfc.ATH.cb_l[kk] * gfc.ATH.adjust;
      }
      if (m1 < ma_max_m * m2) {
        if (m1 > m2) {
          var f, r;
          f = 1;
          if (i <= 13)
            f = table3[i];
          r = Util.FAST_LOG10_X(m1 / m2, 10 / 15);
          return m1 * ((table1[i] - f) * r + f);
        }
        if (i > 13)
          return m1;
        return m1 * table3[i];
      }
      return m1 * table1[i];
    }
    var table2_ = [
      1.33352 * 1.33352,
      1.35879 * 1.35879,
      1.38454 * 1.38454,
      1.39497 * 1.39497,
      1.40548 * 1.40548,
      1.3537 * 1.3537,
      1.30382 * 1.30382,
      1.22321 * 1.22321,
      1.14758 * 1.14758,
      1
    ];
    function vbrpsy_mask_add(m1, m2, b) {
      var ratio;
      if (m1 < 0) {
        m1 = 0;
      }
      if (m2 < 0) {
        m2 = 0;
      }
      if (m1 <= 0) {
        return m2;
      }
      if (m2 <= 0) {
        return m1;
      }
      if (m2 > m1) {
        ratio = m2 / m1;
      } else {
        ratio = m1 / m2;
      }
      if (-2 <= b && b <= 2) {
        if (ratio >= ma_max_i1) {
          return m1 + m2;
        } else {
          var i = 0 | Util.FAST_LOG10_X(ratio, 16);
          return (m1 + m2) * table2_[i];
        }
      }
      if (ratio < ma_max_i2) {
        return m1 + m2;
      }
      if (m1 < m2) {
        m1 = m2;
      }
      return m1;
    }
    function calc_interchannel_masking(gfp, ratio) {
      var gfc = gfp.internal_flags;
      if (gfc.channels_out > 1) {
        for (var sb = 0; sb < Encoder.SBMAX_l; sb++) {
          var l = gfc.thm[0].l[sb];
          var r = gfc.thm[1].l[sb];
          gfc.thm[0].l[sb] += r * ratio;
          gfc.thm[1].l[sb] += l * ratio;
        }
        for (var sb = 0; sb < Encoder.SBMAX_s; sb++) {
          for (var sblock = 0; sblock < 3; sblock++) {
            var l = gfc.thm[0].s[sb][sblock];
            var r = gfc.thm[1].s[sb][sblock];
            gfc.thm[0].s[sb][sblock] += r * ratio;
            gfc.thm[1].s[sb][sblock] += l * ratio;
          }
        }
      }
    }
    function msfix1(gfc) {
      for (var sb = 0; sb < Encoder.SBMAX_l; sb++) {
        if (gfc.thm[0].l[sb] > 1.58 * gfc.thm[1].l[sb] || gfc.thm[1].l[sb] > 1.58 * gfc.thm[0].l[sb])
          continue;
        var mld = gfc.mld_l[sb] * gfc.en[3].l[sb];
        var rmid = Math.max(
          gfc.thm[2].l[sb],
          Math.min(gfc.thm[3].l[sb], mld)
        );
        mld = gfc.mld_l[sb] * gfc.en[2].l[sb];
        var rside = Math.max(
          gfc.thm[3].l[sb],
          Math.min(gfc.thm[2].l[sb], mld)
        );
        gfc.thm[2].l[sb] = rmid;
        gfc.thm[3].l[sb] = rside;
      }
      for (var sb = 0; sb < Encoder.SBMAX_s; sb++) {
        for (var sblock = 0; sblock < 3; sblock++) {
          if (gfc.thm[0].s[sb][sblock] > 1.58 * gfc.thm[1].s[sb][sblock] || gfc.thm[1].s[sb][sblock] > 1.58 * gfc.thm[0].s[sb][sblock])
            continue;
          var mld = gfc.mld_s[sb] * gfc.en[3].s[sb][sblock];
          var rmid = Math.max(
            gfc.thm[2].s[sb][sblock],
            Math.min(gfc.thm[3].s[sb][sblock], mld)
          );
          mld = gfc.mld_s[sb] * gfc.en[2].s[sb][sblock];
          var rside = Math.max(
            gfc.thm[3].s[sb][sblock],
            Math.min(gfc.thm[2].s[sb][sblock], mld)
          );
          gfc.thm[2].s[sb][sblock] = rmid;
          gfc.thm[3].s[sb][sblock] = rside;
        }
      }
    }
    function ns_msfix(gfc, msfix, athadjust) {
      var msfix2 = msfix;
      var athlower = Math.pow(10, athadjust);
      msfix *= 2;
      msfix2 *= 2;
      for (var sb = 0; sb < Encoder.SBMAX_l; sb++) {
        var thmLR, thmM, thmS, ath;
        ath = gfc.ATH.cb_l[gfc.bm_l[sb]] * athlower;
        thmLR = Math.min(
          Math.max(gfc.thm[0].l[sb], ath),
          Math.max(gfc.thm[1].l[sb], ath)
        );
        thmM = Math.max(gfc.thm[2].l[sb], ath);
        thmS = Math.max(gfc.thm[3].l[sb], ath);
        if (thmLR * msfix < thmM + thmS) {
          var f = thmLR * msfix2 / (thmM + thmS);
          thmM *= f;
          thmS *= f;
        }
        gfc.thm[2].l[sb] = Math.min(thmM, gfc.thm[2].l[sb]);
        gfc.thm[3].l[sb] = Math.min(thmS, gfc.thm[3].l[sb]);
      }
      athlower *= Encoder.BLKSIZE_s / Encoder.BLKSIZE;
      for (var sb = 0; sb < Encoder.SBMAX_s; sb++) {
        for (var sblock = 0; sblock < 3; sblock++) {
          var thmLR, thmM, thmS, ath;
          ath = gfc.ATH.cb_s[gfc.bm_s[sb]] * athlower;
          thmLR = Math.min(
            Math.max(gfc.thm[0].s[sb][sblock], ath),
            Math.max(gfc.thm[1].s[sb][sblock], ath)
          );
          thmM = Math.max(gfc.thm[2].s[sb][sblock], ath);
          thmS = Math.max(gfc.thm[3].s[sb][sblock], ath);
          if (thmLR * msfix < thmM + thmS) {
            var f = thmLR * msfix / (thmM + thmS);
            thmM *= f;
            thmS *= f;
          }
          gfc.thm[2].s[sb][sblock] = Math.min(
            gfc.thm[2].s[sb][sblock],
            thmM
          );
          gfc.thm[3].s[sb][sblock] = Math.min(
            gfc.thm[3].s[sb][sblock],
            thmS
          );
        }
      }
    }
    function convert_partition2scalefac_s(gfc, eb, thr, chn, sblock) {
      var sb, b;
      var enn = 0;
      var thmm = 0;
      for (sb = b = 0; sb < Encoder.SBMAX_s; ++b, ++sb) {
        var bo_s_sb = gfc.bo_s[sb];
        var npart_s = gfc.npart_s;
        var b_lim = bo_s_sb < npart_s ? bo_s_sb : npart_s;
        while (b < b_lim) {
          enn += eb[b];
          thmm += thr[b];
          b++;
        }
        gfc.en[chn].s[sb][sblock] = enn;
        gfc.thm[chn].s[sb][sblock] = thmm;
        if (b >= npart_s) {
          ++sb;
          break;
        }
        {
          var w_curr = gfc.PSY.bo_s_weight[sb];
          var w_next = 1 - w_curr;
          enn = w_curr * eb[b];
          thmm = w_curr * thr[b];
          gfc.en[chn].s[sb][sblock] += enn;
          gfc.thm[chn].s[sb][sblock] += thmm;
          enn = w_next * eb[b];
          thmm = w_next * thr[b];
        }
      }
      for (; sb < Encoder.SBMAX_s; ++sb) {
        gfc.en[chn].s[sb][sblock] = 0;
        gfc.thm[chn].s[sb][sblock] = 0;
      }
    }
    function convert_partition2scalefac_l(gfc, eb, thr, chn) {
      var sb, b;
      var enn = 0;
      var thmm = 0;
      for (sb = b = 0; sb < Encoder.SBMAX_l; ++b, ++sb) {
        var bo_l_sb = gfc.bo_l[sb];
        var npart_l = gfc.npart_l;
        var b_lim = bo_l_sb < npart_l ? bo_l_sb : npart_l;
        while (b < b_lim) {
          enn += eb[b];
          thmm += thr[b];
          b++;
        }
        gfc.en[chn].l[sb] = enn;
        gfc.thm[chn].l[sb] = thmm;
        if (b >= npart_l) {
          ++sb;
          break;
        }
        {
          var w_curr = gfc.PSY.bo_l_weight[sb];
          var w_next = 1 - w_curr;
          enn = w_curr * eb[b];
          thmm = w_curr * thr[b];
          gfc.en[chn].l[sb] += enn;
          gfc.thm[chn].l[sb] += thmm;
          enn = w_next * eb[b];
          thmm = w_next * thr[b];
        }
      }
      for (; sb < Encoder.SBMAX_l; ++sb) {
        gfc.en[chn].l[sb] = 0;
        gfc.thm[chn].l[sb] = 0;
      }
    }
    function compute_masking_s(gfp, fftenergy_s, eb, thr, chn, sblock) {
      var gfc = gfp.internal_flags;
      var j, b;
      for (b = j = 0; b < gfc.npart_s; ++b) {
        var ebb = 0, m = 0;
        var n = gfc.numlines_s[b];
        for (var i = 0; i < n; ++i, ++j) {
          var el = fftenergy_s[sblock][j];
          ebb += el;
          if (m < el)
            m = el;
        }
        eb[b] = ebb;
      }
      for (j = b = 0; b < gfc.npart_s; b++) {
        var kk = gfc.s3ind_s[b][0];
        var ecb = gfc.s3_ss[j++] * eb[kk];
        ++kk;
        while (kk <= gfc.s3ind_s[b][1]) {
          ecb += gfc.s3_ss[j] * eb[kk];
          ++j;
          ++kk;
        }
        {
          var x = rpelev_s * gfc.nb_s1[chn][b];
          thr[b] = Math.min(ecb, x);
        }
        if (gfc.blocktype_old[chn & 1] == Encoder.SHORT_TYPE) {
          var x = rpelev2_s * gfc.nb_s2[chn][b];
          var y = thr[b];
          thr[b] = Math.min(x, y);
        }
        gfc.nb_s2[chn][b] = gfc.nb_s1[chn][b];
        gfc.nb_s1[chn][b] = ecb;
      }
      for (; b <= Encoder.CBANDS; ++b) {
        eb[b] = 0;
        thr[b] = 0;
      }
    }
    function block_type_set(gfp, uselongblock, blocktype_d, blocktype) {
      var gfc = gfp.internal_flags;
      if (gfp.short_blocks == ShortBlock.short_block_coupled && !(uselongblock[0] != 0 && uselongblock[1] != 0))
        uselongblock[0] = uselongblock[1] = 0;
      for (var chn = 0; chn < gfc.channels_out; chn++) {
        blocktype[chn] = Encoder.NORM_TYPE;
        if (gfp.short_blocks == ShortBlock.short_block_dispensed)
          uselongblock[chn] = 1;
        if (gfp.short_blocks == ShortBlock.short_block_forced)
          uselongblock[chn] = 0;
        if (uselongblock[chn] != 0) {
          if (gfc.blocktype_old[chn] == Encoder.SHORT_TYPE)
            blocktype[chn] = Encoder.STOP_TYPE;
        } else {
          blocktype[chn] = Encoder.SHORT_TYPE;
          if (gfc.blocktype_old[chn] == Encoder.NORM_TYPE) {
            gfc.blocktype_old[chn] = Encoder.START_TYPE;
          }
          if (gfc.blocktype_old[chn] == Encoder.STOP_TYPE)
            gfc.blocktype_old[chn] = Encoder.SHORT_TYPE;
        }
        blocktype_d[chn] = gfc.blocktype_old[chn];
        gfc.blocktype_old[chn] = blocktype[chn];
      }
    }
    function NS_INTERP(x, y, r) {
      if (r >= 1) {
        return x;
      }
      if (r <= 0)
        return y;
      if (y > 0) {
        return Math.pow(x / y, r) * y;
      }
      return 0;
    }
    var regcoef_s = [
      11.8,
      13.6,
      17.2,
      32,
      46.5,
      51.3,
      57.5,
      67.1,
      71.5,
      84.6,
      97.6,
      130
      /* 255.8 */
    ];
    function pecalc_s(mr, masking_lower) {
      var pe_s = 1236.28 / 4;
      for (var sb = 0; sb < Encoder.SBMAX_s - 1; sb++) {
        for (var sblock = 0; sblock < 3; sblock++) {
          var thm = mr.thm.s[sb][sblock];
          if (thm > 0) {
            var x = thm * masking_lower;
            var en = mr.en.s[sb][sblock];
            if (en > x) {
              if (en > x * 1e10) {
                pe_s += regcoef_s[sb] * (10 * LOG10);
              } else {
                pe_s += regcoef_s[sb] * Util.FAST_LOG10(en / x);
              }
            }
          }
        }
      }
      return pe_s;
    }
    var regcoef_l = [
      6.8,
      5.8,
      5.8,
      6.4,
      6.5,
      9.9,
      12.1,
      14.4,
      15,
      18.9,
      21.6,
      26.9,
      34.2,
      40.2,
      46.8,
      56.5,
      60.7,
      73.9,
      85.7,
      93.4,
      126.1
      /* 241.3 */
    ];
    function pecalc_l(mr, masking_lower) {
      var pe_l = 1124.23 / 4;
      for (var sb = 0; sb < Encoder.SBMAX_l - 1; sb++) {
        var thm = mr.thm.l[sb];
        if (thm > 0) {
          var x = thm * masking_lower;
          var en = mr.en.l[sb];
          if (en > x) {
            if (en > x * 1e10) {
              pe_l += regcoef_l[sb] * (10 * LOG10);
            } else {
              pe_l += regcoef_l[sb] * Util.FAST_LOG10(en / x);
            }
          }
        }
      }
      return pe_l;
    }
    function calc_energy(gfc, fftenergy, eb, max, avg) {
      var b, j;
      for (b = j = 0; b < gfc.npart_l; ++b) {
        var ebb = 0, m = 0;
        var i;
        for (i = 0; i < gfc.numlines_l[b]; ++i, ++j) {
          var el = fftenergy[j];
          ebb += el;
          if (m < el)
            m = el;
        }
        eb[b] = ebb;
        max[b] = m;
        avg[b] = ebb * gfc.rnumlines_l[b];
      }
    }
    function calc_mask_index_l(gfc, max, avg, mask_idx) {
      var last_tab_entry = tab.length - 1;
      var b = 0;
      var a = avg[b] + avg[b + 1];
      if (a > 0) {
        var m = max[b];
        if (m < max[b + 1])
          m = max[b + 1];
        a = 20 * (m * 2 - a) / (a * (gfc.numlines_l[b] + gfc.numlines_l[b + 1] - 1));
        var k = 0 | a;
        if (k > last_tab_entry)
          k = last_tab_entry;
        mask_idx[b] = k;
      } else {
        mask_idx[b] = 0;
      }
      for (b = 1; b < gfc.npart_l - 1; b++) {
        a = avg[b - 1] + avg[b] + avg[b + 1];
        if (a > 0) {
          var m = max[b - 1];
          if (m < max[b])
            m = max[b];
          if (m < max[b + 1])
            m = max[b + 1];
          a = 20 * (m * 3 - a) / (a * (gfc.numlines_l[b - 1] + gfc.numlines_l[b] + gfc.numlines_l[b + 1] - 1));
          var k = 0 | a;
          if (k > last_tab_entry)
            k = last_tab_entry;
          mask_idx[b] = k;
        } else {
          mask_idx[b] = 0;
        }
      }
      a = avg[b - 1] + avg[b];
      if (a > 0) {
        var m = max[b - 1];
        if (m < max[b])
          m = max[b];
        a = 20 * (m * 2 - a) / (a * (gfc.numlines_l[b - 1] + gfc.numlines_l[b] - 1));
        var k = 0 | a;
        if (k > last_tab_entry)
          k = last_tab_entry;
        mask_idx[b] = k;
      } else {
        mask_idx[b] = 0;
      }
    }
    var fircoef = [
      -865163e-23 * 2,
      -851586e-8 * 2,
      -674764e-23 * 2,
      0.0209036 * 2,
      -336639e-22 * 2,
      -0.0438162 * 2,
      -154175e-22 * 2,
      0.0931738 * 2,
      -552212e-22 * 2,
      -0.313819 * 2
    ];
    this.L3psycho_anal_ns = function(gfp, buffer, bufPos, gr_out, masking_ratio, masking_MS_ratio, percep_entropy, percep_MS_entropy, energy, blocktype_d) {
      var gfc = gfp.internal_flags;
      var wsamp_L = new_float_n([2, Encoder.BLKSIZE]);
      var wsamp_S = new_float_n([2, 3, Encoder.BLKSIZE_s]);
      var eb_l = new_float(Encoder.CBANDS + 1);
      var eb_s = new_float(Encoder.CBANDS + 1);
      var thr = new_float(Encoder.CBANDS + 2);
      var blocktype = new_int(2), uselongblock = new_int(2);
      var numchn, chn;
      var b, i, j, k;
      var sb, sblock;
      var ns_hpfsmpl = new_float_n([2, 576]);
      var pcfact;
      var mask_idx_l = new_int(Encoder.CBANDS + 2), mask_idx_s = new_int(Encoder.CBANDS + 2);
      Arrays.fill(mask_idx_s, 0);
      numchn = gfc.channels_out;
      if (gfp.mode == MPEGMode.JOINT_STEREO)
        numchn = 4;
      if (gfp.VBR == VbrMode.vbr_off)
        pcfact = gfc.ResvMax == 0 ? 0 : gfc.ResvSize / gfc.ResvMax * 0.5;
      else if (gfp.VBR == VbrMode.vbr_rh || gfp.VBR == VbrMode.vbr_mtrh || gfp.VBR == VbrMode.vbr_mt) {
        pcfact = 0.6;
      } else
        pcfact = 1;
      for (chn = 0; chn < gfc.channels_out; chn++) {
        var firbuf2 = buffer[chn];
        var firbufPos = bufPos + 576 - 350 - NSFIRLEN + 192;
        for (i = 0; i < 576; i++) {
          var sum1, sum2;
          sum1 = firbuf2[firbufPos + i + 10];
          sum2 = 0;
          for (j = 0; j < (NSFIRLEN - 1) / 2 - 1; j += 2) {
            sum1 += fircoef[j] * (firbuf2[firbufPos + i + j] + firbuf2[firbufPos + i + NSFIRLEN - j]);
            sum2 += fircoef[j + 1] * (firbuf2[firbufPos + i + j + 1] + firbuf2[firbufPos + i + NSFIRLEN - j - 1]);
          }
          ns_hpfsmpl[chn][i] = sum1 + sum2;
        }
        masking_ratio[gr_out][chn].en.assign(gfc.en[chn]);
        masking_ratio[gr_out][chn].thm.assign(gfc.thm[chn]);
        if (numchn > 2) {
          masking_MS_ratio[gr_out][chn].en.assign(gfc.en[chn + 2]);
          masking_MS_ratio[gr_out][chn].thm.assign(gfc.thm[chn + 2]);
        }
      }
      for (chn = 0; chn < numchn; chn++) {
        var wsamp_l;
        var wsamp_s;
        var en_subshort = new_float(12);
        var en_short = [0, 0, 0, 0];
        var attack_intensity = new_float(12);
        var ns_uselongblock = 1;
        var attackThreshold;
        var max = new_float(Encoder.CBANDS), avg = new_float(Encoder.CBANDS);
        var ns_attacks = [0, 0, 0, 0];
        var fftenergy = new_float(Encoder.HBLKSIZE);
        var fftenergy_s = new_float_n([3, Encoder.HBLKSIZE_s]);
        for (i = 0; i < 3; i++) {
          en_subshort[i] = gfc.nsPsy.last_en_subshort[chn][i + 6];
          attack_intensity[i] = en_subshort[i] / gfc.nsPsy.last_en_subshort[chn][i + 4];
          en_short[0] += en_subshort[i];
        }
        if (chn == 2) {
          for (i = 0; i < 576; i++) {
            var l, r;
            l = ns_hpfsmpl[0][i];
            r = ns_hpfsmpl[1][i];
            ns_hpfsmpl[0][i] = l + r;
            ns_hpfsmpl[1][i] = l - r;
          }
        }
        {
          var pf = ns_hpfsmpl[chn & 1];
          var pfPos = 0;
          for (i = 0; i < 9; i++) {
            var pfe = pfPos + 576 / 9;
            var p = 1;
            for (; pfPos < pfe; pfPos++)
              if (p < Math.abs(pf[pfPos]))
                p = Math.abs(pf[pfPos]);
            gfc.nsPsy.last_en_subshort[chn][i] = en_subshort[i + 3] = p;
            en_short[1 + i / 3] += p;
            if (p > en_subshort[i + 3 - 2]) {
              p = p / en_subshort[i + 3 - 2];
            } else if (en_subshort[i + 3 - 2] > p * 10) {
              p = en_subshort[i + 3 - 2] / (p * 10);
            } else
              p = 0;
            attack_intensity[i + 3] = p;
          }
        }
        if (gfp.analysis) {
          var x = attack_intensity[0];
          for (i = 1; i < 12; i++)
            if (x < attack_intensity[i])
              x = attack_intensity[i];
          gfc.pinfo.ers[gr_out][chn] = gfc.pinfo.ers_save[chn];
          gfc.pinfo.ers_save[chn] = x;
        }
        attackThreshold = chn == 3 ? gfc.nsPsy.attackthre_s : gfc.nsPsy.attackthre;
        for (i = 0; i < 12; i++)
          if (0 == ns_attacks[i / 3] && attack_intensity[i] > attackThreshold)
            ns_attacks[i / 3] = i % 3 + 1;
        for (i = 1; i < 4; i++) {
          var ratio;
          if (en_short[i - 1] > en_short[i]) {
            ratio = en_short[i - 1] / en_short[i];
          } else {
            ratio = en_short[i] / en_short[i - 1];
          }
          if (ratio < 1.7) {
            ns_attacks[i] = 0;
            if (i == 1)
              ns_attacks[0] = 0;
          }
        }
        if (ns_attacks[0] != 0 && gfc.nsPsy.lastAttacks[chn] != 0)
          ns_attacks[0] = 0;
        if (gfc.nsPsy.lastAttacks[chn] == 3 || ns_attacks[0] + ns_attacks[1] + ns_attacks[2] + ns_attacks[3] != 0) {
          ns_uselongblock = 0;
          if (ns_attacks[1] != 0 && ns_attacks[0] != 0)
            ns_attacks[1] = 0;
          if (ns_attacks[2] != 0 && ns_attacks[1] != 0)
            ns_attacks[2] = 0;
          if (ns_attacks[3] != 0 && ns_attacks[2] != 0)
            ns_attacks[3] = 0;
        }
        if (chn < 2) {
          uselongblock[chn] = ns_uselongblock;
        } else {
          if (ns_uselongblock == 0) {
            uselongblock[0] = uselongblock[1] = 0;
          }
        }
        energy[chn] = gfc.tot_ener[chn];
        wsamp_s = wsamp_S;
        wsamp_l = wsamp_L;
        compute_ffts(
          gfp,
          fftenergy,
          fftenergy_s,
          wsamp_l,
          chn & 1,
          wsamp_s,
          chn & 1,
          gr_out,
          chn,
          buffer,
          bufPos
        );
        calc_energy(gfc, fftenergy, eb_l, max, avg);
        calc_mask_index_l(gfc, max, avg, mask_idx_l);
        for (sblock = 0; sblock < 3; sblock++) {
          var enn, thmm;
          compute_masking_s(gfp, fftenergy_s, eb_s, thr, chn, sblock);
          convert_partition2scalefac_s(gfc, eb_s, thr, chn, sblock);
          for (sb = 0; sb < Encoder.SBMAX_s; sb++) {
            thmm = gfc.thm[chn].s[sb][sblock];
            thmm *= NS_PREECHO_ATT0;
            if (ns_attacks[sblock] >= 2 || ns_attacks[sblock + 1] == 1) {
              var idx = sblock != 0 ? sblock - 1 : 2;
              var p = NS_INTERP(
                gfc.thm[chn].s[sb][idx],
                thmm,
                NS_PREECHO_ATT1 * pcfact
              );
              thmm = Math.min(thmm, p);
            }
            if (ns_attacks[sblock] == 1) {
              var idx = sblock != 0 ? sblock - 1 : 2;
              var p = NS_INTERP(
                gfc.thm[chn].s[sb][idx],
                thmm,
                NS_PREECHO_ATT2 * pcfact
              );
              thmm = Math.min(thmm, p);
            } else if (sblock != 0 && ns_attacks[sblock - 1] == 3 || sblock == 0 && gfc.nsPsy.lastAttacks[chn] == 3) {
              var idx = sblock != 2 ? sblock + 1 : 0;
              var p = NS_INTERP(
                gfc.thm[chn].s[sb][idx],
                thmm,
                NS_PREECHO_ATT2 * pcfact
              );
              thmm = Math.min(thmm, p);
            }
            enn = en_subshort[sblock * 3 + 3] + en_subshort[sblock * 3 + 4] + en_subshort[sblock * 3 + 5];
            if (en_subshort[sblock * 3 + 5] * 6 < enn) {
              thmm *= 0.5;
              if (en_subshort[sblock * 3 + 4] * 6 < enn)
                thmm *= 0.5;
            }
            gfc.thm[chn].s[sb][sblock] = thmm;
          }
        }
        gfc.nsPsy.lastAttacks[chn] = ns_attacks[2];
        k = 0;
        {
          for (b = 0; b < gfc.npart_l; b++) {
            var kk = gfc.s3ind[b][0];
            var eb2 = eb_l[kk] * tab[mask_idx_l[kk]];
            var ecb = gfc.s3_ll[k++] * eb2;
            while (++kk <= gfc.s3ind[b][1]) {
              eb2 = eb_l[kk] * tab[mask_idx_l[kk]];
              ecb = mask_add(
                ecb,
                gfc.s3_ll[k++] * eb2,
                kk,
                kk - b,
                gfc,
                0
              );
            }
            ecb *= 0.158489319246111;
            if (gfc.blocktype_old[chn & 1] == Encoder.SHORT_TYPE)
              thr[b] = ecb;
            else
              thr[b] = NS_INTERP(
                Math.min(ecb, Math.min(rpelev * gfc.nb_1[chn][b], rpelev2 * gfc.nb_2[chn][b])),
                ecb,
                pcfact
              );
            gfc.nb_2[chn][b] = gfc.nb_1[chn][b];
            gfc.nb_1[chn][b] = ecb;
          }
        }
        for (; b <= Encoder.CBANDS; ++b) {
          eb_l[b] = 0;
          thr[b] = 0;
        }
        convert_partition2scalefac_l(gfc, eb_l, thr, chn);
      }
      if (gfp.mode == MPEGMode.STEREO || gfp.mode == MPEGMode.JOINT_STEREO) {
        if (gfp.interChRatio > 0) {
          calc_interchannel_masking(gfp, gfp.interChRatio);
        }
      }
      if (gfp.mode == MPEGMode.JOINT_STEREO) {
        var msfix;
        msfix1(gfc);
        msfix = gfp.msfix;
        if (Math.abs(msfix) > 0)
          ns_msfix(gfc, msfix, gfp.ATHlower * gfc.ATH.adjust);
      }
      block_type_set(gfp, uselongblock, blocktype_d, blocktype);
      for (chn = 0; chn < numchn; chn++) {
        var ppe;
        var ppePos = 0;
        var type;
        var mr;
        if (chn > 1) {
          ppe = percep_MS_entropy;
          ppePos = -2;
          type = Encoder.NORM_TYPE;
          if (blocktype_d[0] == Encoder.SHORT_TYPE || blocktype_d[1] == Encoder.SHORT_TYPE)
            type = Encoder.SHORT_TYPE;
          mr = masking_MS_ratio[gr_out][chn - 2];
        } else {
          ppe = percep_entropy;
          ppePos = 0;
          type = blocktype_d[chn];
          mr = masking_ratio[gr_out][chn];
        }
        if (type == Encoder.SHORT_TYPE)
          ppe[ppePos + chn] = pecalc_s(mr, gfc.masking_lower);
        else
          ppe[ppePos + chn] = pecalc_l(mr, gfc.masking_lower);
        if (gfp.analysis)
          gfc.pinfo.pe[gr_out][chn] = ppe[ppePos + chn];
      }
      return 0;
    };
    function vbrpsy_compute_fft_l(gfp, buffer, bufPos, chn, gr_out, fftenergy, wsamp_l, wsamp_lPos) {
      var gfc = gfp.internal_flags;
      if (chn < 2) {
        fft.fft_long(gfc, wsamp_l[wsamp_lPos], chn, buffer, bufPos);
      } else if (chn == 2) {
        for (var j = Encoder.BLKSIZE - 1; j >= 0; --j) {
          var l = wsamp_l[wsamp_lPos + 0][j];
          var r = wsamp_l[wsamp_lPos + 1][j];
          wsamp_l[wsamp_lPos + 0][j] = (l + r) * Util.SQRT2 * 0.5;
          wsamp_l[wsamp_lPos + 1][j] = (l - r) * Util.SQRT2 * 0.5;
        }
      }
      fftenergy[0] = NON_LINEAR_SCALE_ENERGY(wsamp_l[wsamp_lPos + 0][0]);
      fftenergy[0] *= fftenergy[0];
      for (var j = Encoder.BLKSIZE / 2 - 1; j >= 0; --j) {
        var re = wsamp_l[wsamp_lPos + 0][Encoder.BLKSIZE / 2 - j];
        var im = wsamp_l[wsamp_lPos + 0][Encoder.BLKSIZE / 2 + j];
        fftenergy[Encoder.BLKSIZE / 2 - j] = NON_LINEAR_SCALE_ENERGY((re * re + im * im) * 0.5);
      }
      {
        var totalenergy = 0;
        for (var j = 11; j < Encoder.HBLKSIZE; j++)
          totalenergy += fftenergy[j];
        gfc.tot_ener[chn] = totalenergy;
      }
      if (gfp.analysis) {
        for (var j = 0; j < Encoder.HBLKSIZE; j++) {
          gfc.pinfo.energy[gr_out][chn][j] = gfc.pinfo.energy_save[chn][j];
          gfc.pinfo.energy_save[chn][j] = fftenergy[j];
        }
        gfc.pinfo.pe[gr_out][chn] = gfc.pe[chn];
      }
    }
    function vbrpsy_compute_fft_s(gfp, buffer, bufPos, chn, sblock, fftenergy_s, wsamp_s, wsamp_sPos) {
      var gfc = gfp.internal_flags;
      if (sblock == 0 && chn < 2) {
        fft.fft_short(gfc, wsamp_s[wsamp_sPos], chn, buffer, bufPos);
      }
      if (chn == 2) {
        for (var j = Encoder.BLKSIZE_s - 1; j >= 0; --j) {
          var l = wsamp_s[wsamp_sPos + 0][sblock][j];
          var r = wsamp_s[wsamp_sPos + 1][sblock][j];
          wsamp_s[wsamp_sPos + 0][sblock][j] = (l + r) * Util.SQRT2 * 0.5;
          wsamp_s[wsamp_sPos + 1][sblock][j] = (l - r) * Util.SQRT2 * 0.5;
        }
      }
      fftenergy_s[sblock][0] = wsamp_s[wsamp_sPos + 0][sblock][0];
      fftenergy_s[sblock][0] *= fftenergy_s[sblock][0];
      for (var j = Encoder.BLKSIZE_s / 2 - 1; j >= 0; --j) {
        var re = wsamp_s[wsamp_sPos + 0][sblock][Encoder.BLKSIZE_s / 2 - j];
        var im = wsamp_s[wsamp_sPos + 0][sblock][Encoder.BLKSIZE_s / 2 + j];
        fftenergy_s[sblock][Encoder.BLKSIZE_s / 2 - j] = NON_LINEAR_SCALE_ENERGY((re * re + im * im) * 0.5);
      }
    }
    function vbrpsy_compute_loudness_approximation_l(gfp, gr_out, chn, fftenergy) {
      var gfc = gfp.internal_flags;
      if (gfp.athaa_loudapprox == 2 && chn < 2) {
        gfc.loudness_sq[gr_out][chn] = gfc.loudness_sq_save[chn];
        gfc.loudness_sq_save[chn] = psycho_loudness_approx(fftenergy, gfc);
      }
    }
    var fircoef_ = [
      -865163e-23 * 2,
      -851586e-8 * 2,
      -674764e-23 * 2,
      0.0209036 * 2,
      -336639e-22 * 2,
      -0.0438162 * 2,
      -154175e-22 * 2,
      0.0931738 * 2,
      -552212e-22 * 2,
      -0.313819 * 2
    ];
    function vbrpsy_attack_detection(gfp, buffer, bufPos, gr_out, masking_ratio, masking_MS_ratio, energy, sub_short_factor, ns_attacks, uselongblock) {
      var ns_hpfsmpl = new_float_n([2, 576]);
      var gfc = gfp.internal_flags;
      var n_chn_out = gfc.channels_out;
      var n_chn_psy = gfp.mode == MPEGMode.JOINT_STEREO ? 4 : n_chn_out;
      for (var chn = 0; chn < n_chn_out; chn++) {
        firbuf = buffer[chn];
        var firbufPos = bufPos + 576 - 350 - NSFIRLEN + 192;
        for (var i = 0; i < 576; i++) {
          var sum1, sum2;
          sum1 = firbuf[firbufPos + i + 10];
          sum2 = 0;
          for (var j = 0; j < (NSFIRLEN - 1) / 2 - 1; j += 2) {
            sum1 += fircoef_[j] * (firbuf[firbufPos + i + j] + firbuf[firbufPos + i + NSFIRLEN - j]);
            sum2 += fircoef_[j + 1] * (firbuf[firbufPos + i + j + 1] + firbuf[firbufPos + i + NSFIRLEN - j - 1]);
          }
          ns_hpfsmpl[chn][i] = sum1 + sum2;
        }
        masking_ratio[gr_out][chn].en.assign(gfc.en[chn]);
        masking_ratio[gr_out][chn].thm.assign(gfc.thm[chn]);
        if (n_chn_psy > 2) {
          masking_MS_ratio[gr_out][chn].en.assign(gfc.en[chn + 2]);
          masking_MS_ratio[gr_out][chn].thm.assign(gfc.thm[chn + 2]);
        }
      }
      for (var chn = 0; chn < n_chn_psy; chn++) {
        var attack_intensity = new_float(12);
        var en_subshort = new_float(12);
        var en_short = [0, 0, 0, 0];
        var pf = ns_hpfsmpl[chn & 1];
        var pfPos = 0;
        var attackThreshold = chn == 3 ? gfc.nsPsy.attackthre_s : gfc.nsPsy.attackthre;
        var ns_uselongblock = 1;
        if (chn == 2) {
          for (var i = 0, j = 576; j > 0; ++i, --j) {
            var l = ns_hpfsmpl[0][i];
            var r = ns_hpfsmpl[1][i];
            ns_hpfsmpl[0][i] = l + r;
            ns_hpfsmpl[1][i] = l - r;
          }
        }
        for (var i = 0; i < 3; i++) {
          en_subshort[i] = gfc.nsPsy.last_en_subshort[chn][i + 6];
          attack_intensity[i] = en_subshort[i] / gfc.nsPsy.last_en_subshort[chn][i + 4];
          en_short[0] += en_subshort[i];
        }
        for (var i = 0; i < 9; i++) {
          var pfe = pfPos + 576 / 9;
          var p = 1;
          for (; pfPos < pfe; pfPos++)
            if (p < Math.abs(pf[pfPos]))
              p = Math.abs(pf[pfPos]);
          gfc.nsPsy.last_en_subshort[chn][i] = en_subshort[i + 3] = p;
          en_short[1 + i / 3] += p;
          if (p > en_subshort[i + 3 - 2]) {
            p = p / en_subshort[i + 3 - 2];
          } else if (en_subshort[i + 3 - 2] > p * 10) {
            p = en_subshort[i + 3 - 2] / (p * 10);
          } else {
            p = 0;
          }
          attack_intensity[i + 3] = p;
        }
        for (var i = 0; i < 3; ++i) {
          var enn = en_subshort[i * 3 + 3] + en_subshort[i * 3 + 4] + en_subshort[i * 3 + 5];
          var factor = 1;
          if (en_subshort[i * 3 + 5] * 6 < enn) {
            factor *= 0.5;
            if (en_subshort[i * 3 + 4] * 6 < enn) {
              factor *= 0.5;
            }
          }
          sub_short_factor[chn][i] = factor;
        }
        if (gfp.analysis) {
          var x = attack_intensity[0];
          for (var i = 1; i < 12; i++) {
            if (x < attack_intensity[i]) {
              x = attack_intensity[i];
            }
          }
          gfc.pinfo.ers[gr_out][chn] = gfc.pinfo.ers_save[chn];
          gfc.pinfo.ers_save[chn] = x;
        }
        for (var i = 0; i < 12; i++) {
          if (0 == ns_attacks[chn][i / 3] && attack_intensity[i] > attackThreshold) {
            ns_attacks[chn][i / 3] = i % 3 + 1;
          }
        }
        for (var i = 1; i < 4; i++) {
          var u = en_short[i - 1];
          var v = en_short[i];
          var m = Math.max(u, v);
          if (m < 4e4) {
            if (u < 1.7 * v && v < 1.7 * u) {
              if (i == 1 && ns_attacks[chn][0] <= ns_attacks[chn][i]) {
                ns_attacks[chn][0] = 0;
              }
              ns_attacks[chn][i] = 0;
            }
          }
        }
        if (ns_attacks[chn][0] <= gfc.nsPsy.lastAttacks[chn]) {
          ns_attacks[chn][0] = 0;
        }
        if (gfc.nsPsy.lastAttacks[chn] == 3 || ns_attacks[chn][0] + ns_attacks[chn][1] + ns_attacks[chn][2] + ns_attacks[chn][3] != 0) {
          ns_uselongblock = 0;
          if (ns_attacks[chn][1] != 0 && ns_attacks[chn][0] != 0) {
            ns_attacks[chn][1] = 0;
          }
          if (ns_attacks[chn][2] != 0 && ns_attacks[chn][1] != 0) {
            ns_attacks[chn][2] = 0;
          }
          if (ns_attacks[chn][3] != 0 && ns_attacks[chn][2] != 0) {
            ns_attacks[chn][3] = 0;
          }
        }
        if (chn < 2) {
          uselongblock[chn] = ns_uselongblock;
        } else {
          if (ns_uselongblock == 0) {
            uselongblock[0] = uselongblock[1] = 0;
          }
        }
        energy[chn] = gfc.tot_ener[chn];
      }
    }
    function vbrpsy_skip_masking_s(gfc, chn, sblock) {
      if (sblock == 0) {
        for (var b = 0; b < gfc.npart_s; b++) {
          gfc.nb_s2[chn][b] = gfc.nb_s1[chn][b];
          gfc.nb_s1[chn][b] = 0;
        }
      }
    }
    function vbrpsy_skip_masking_l(gfc, chn) {
      for (var b = 0; b < gfc.npart_l; b++) {
        gfc.nb_2[chn][b] = gfc.nb_1[chn][b];
        gfc.nb_1[chn][b] = 0;
      }
    }
    function psyvbr_calc_mask_index_s(gfc, max, avg, mask_idx) {
      var last_tab_entry = tab.length - 1;
      var b = 0;
      var a = avg[b] + avg[b + 1];
      if (a > 0) {
        var m = max[b];
        if (m < max[b + 1])
          m = max[b + 1];
        a = 20 * (m * 2 - a) / (a * (gfc.numlines_s[b] + gfc.numlines_s[b + 1] - 1));
        var k = 0 | a;
        if (k > last_tab_entry)
          k = last_tab_entry;
        mask_idx[b] = k;
      } else {
        mask_idx[b] = 0;
      }
      for (b = 1; b < gfc.npart_s - 1; b++) {
        a = avg[b - 1] + avg[b] + avg[b + 1];
        if (a > 0) {
          var m = max[b - 1];
          if (m < max[b])
            m = max[b];
          if (m < max[b + 1])
            m = max[b + 1];
          a = 20 * (m * 3 - a) / (a * (gfc.numlines_s[b - 1] + gfc.numlines_s[b] + gfc.numlines_s[b + 1] - 1));
          var k = 0 | a;
          if (k > last_tab_entry)
            k = last_tab_entry;
          mask_idx[b] = k;
        } else {
          mask_idx[b] = 0;
        }
      }
      a = avg[b - 1] + avg[b];
      if (a > 0) {
        var m = max[b - 1];
        if (m < max[b])
          m = max[b];
        a = 20 * (m * 2 - a) / (a * (gfc.numlines_s[b - 1] + gfc.numlines_s[b] - 1));
        var k = 0 | a;
        if (k > last_tab_entry)
          k = last_tab_entry;
        mask_idx[b] = k;
      } else {
        mask_idx[b] = 0;
      }
    }
    function vbrpsy_compute_masking_s(gfp, fftenergy_s, eb, thr, chn, sblock) {
      var gfc = gfp.internal_flags;
      var max = new float[Encoder.CBANDS](), avg = new_float(Encoder.CBANDS);
      var i, j, b;
      var mask_idx_s = new int[Encoder.CBANDS]();
      for (b = j = 0; b < gfc.npart_s; ++b) {
        var ebb = 0, m = 0;
        var n = gfc.numlines_s[b];
        for (i = 0; i < n; ++i, ++j) {
          var el = fftenergy_s[sblock][j];
          ebb += el;
          if (m < el)
            m = el;
        }
        eb[b] = ebb;
        max[b] = m;
        avg[b] = ebb / n;
      }
      for (; b < Encoder.CBANDS; ++b) {
        max[b] = 0;
        avg[b] = 0;
      }
      psyvbr_calc_mask_index_s(gfc, max, avg, mask_idx_s);
      for (j = b = 0; b < gfc.npart_s; b++) {
        var kk = gfc.s3ind_s[b][0];
        var last = gfc.s3ind_s[b][1];
        var dd, dd_n;
        var x, ecb, avg_mask;
        dd = mask_idx_s[kk];
        dd_n = 1;
        ecb = gfc.s3_ss[j] * eb[kk] * tab[mask_idx_s[kk]];
        ++j;
        ++kk;
        while (kk <= last) {
          dd += mask_idx_s[kk];
          dd_n += 1;
          x = gfc.s3_ss[j] * eb[kk] * tab[mask_idx_s[kk]];
          ecb = vbrpsy_mask_add(ecb, x, kk - b);
          ++j;
          ++kk;
        }
        dd = (1 + 2 * dd) / (2 * dd_n);
        avg_mask = tab[dd] * 0.5;
        ecb *= avg_mask;
        thr[b] = ecb;
        gfc.nb_s2[chn][b] = gfc.nb_s1[chn][b];
        gfc.nb_s1[chn][b] = ecb;
        {
          x = max[b];
          x *= gfc.minval_s[b];
          x *= avg_mask;
          if (thr[b] > x) {
            thr[b] = x;
          }
        }
        if (gfc.masking_lower > 1) {
          thr[b] *= gfc.masking_lower;
        }
        if (thr[b] > eb[b]) {
          thr[b] = eb[b];
        }
        if (gfc.masking_lower < 1) {
          thr[b] *= gfc.masking_lower;
        }
      }
      for (; b < Encoder.CBANDS; ++b) {
        eb[b] = 0;
        thr[b] = 0;
      }
    }
    function vbrpsy_compute_masking_l(gfc, fftenergy, eb_l, thr, chn) {
      var max = new_float(Encoder.CBANDS), avg = new_float(Encoder.CBANDS);
      var mask_idx_l = new_int(Encoder.CBANDS + 2);
      var b;
      calc_energy(gfc, fftenergy, eb_l, max, avg);
      calc_mask_index_l(gfc, max, avg, mask_idx_l);
      var k = 0;
      for (b = 0; b < gfc.npart_l; b++) {
        var x, ecb, avg_mask, t;
        var kk = gfc.s3ind[b][0];
        var last = gfc.s3ind[b][1];
        var dd = 0, dd_n = 0;
        dd = mask_idx_l[kk];
        dd_n += 1;
        ecb = gfc.s3_ll[k] * eb_l[kk] * tab[mask_idx_l[kk]];
        ++k;
        ++kk;
        while (kk <= last) {
          dd += mask_idx_l[kk];
          dd_n += 1;
          x = gfc.s3_ll[k] * eb_l[kk] * tab[mask_idx_l[kk]];
          t = vbrpsy_mask_add(ecb, x, kk - b);
          ecb = t;
          ++k;
          ++kk;
        }
        dd = (1 + 2 * dd) / (2 * dd_n);
        avg_mask = tab[dd] * 0.5;
        ecb *= avg_mask;
        if (gfc.blocktype_old[chn & 1] == Encoder.SHORT_TYPE) {
          var ecb_limit = rpelev * gfc.nb_1[chn][b];
          if (ecb_limit > 0) {
            thr[b] = Math.min(ecb, ecb_limit);
          } else {
            thr[b] = Math.min(ecb, eb_l[b] * NS_PREECHO_ATT2);
          }
        } else {
          var ecb_limit_2 = rpelev2 * gfc.nb_2[chn][b];
          var ecb_limit_1 = rpelev * gfc.nb_1[chn][b];
          var ecb_limit;
          if (ecb_limit_2 <= 0) {
            ecb_limit_2 = ecb;
          }
          if (ecb_limit_1 <= 0) {
            ecb_limit_1 = ecb;
          }
          if (gfc.blocktype_old[chn & 1] == Encoder.NORM_TYPE) {
            ecb_limit = Math.min(ecb_limit_1, ecb_limit_2);
          } else {
            ecb_limit = ecb_limit_1;
          }
          thr[b] = Math.min(ecb, ecb_limit);
        }
        gfc.nb_2[chn][b] = gfc.nb_1[chn][b];
        gfc.nb_1[chn][b] = ecb;
        {
          x = max[b];
          x *= gfc.minval_l[b];
          x *= avg_mask;
          if (thr[b] > x) {
            thr[b] = x;
          }
        }
        if (gfc.masking_lower > 1) {
          thr[b] *= gfc.masking_lower;
        }
        if (thr[b] > eb_l[b]) {
          thr[b] = eb_l[b];
        }
        if (gfc.masking_lower < 1) {
          thr[b] *= gfc.masking_lower;
        }
      }
      for (; b < Encoder.CBANDS; ++b) {
        eb_l[b] = 0;
        thr[b] = 0;
      }
    }
    function vbrpsy_compute_block_type(gfp, uselongblock) {
      var gfc = gfp.internal_flags;
      if (gfp.short_blocks == ShortBlock.short_block_coupled && !(uselongblock[0] != 0 && uselongblock[1] != 0))
        uselongblock[0] = uselongblock[1] = 0;
      for (var chn = 0; chn < gfc.channels_out; chn++) {
        if (gfp.short_blocks == ShortBlock.short_block_dispensed) {
          uselongblock[chn] = 1;
        }
        if (gfp.short_blocks == ShortBlock.short_block_forced) {
          uselongblock[chn] = 0;
        }
      }
    }
    function vbrpsy_apply_block_type(gfp, uselongblock, blocktype_d) {
      var gfc = gfp.internal_flags;
      for (var chn = 0; chn < gfc.channels_out; chn++) {
        var blocktype = Encoder.NORM_TYPE;
        if (uselongblock[chn] != 0) {
          if (gfc.blocktype_old[chn] == Encoder.SHORT_TYPE)
            blocktype = Encoder.STOP_TYPE;
        } else {
          blocktype = Encoder.SHORT_TYPE;
          if (gfc.blocktype_old[chn] == Encoder.NORM_TYPE) {
            gfc.blocktype_old[chn] = Encoder.START_TYPE;
          }
          if (gfc.blocktype_old[chn] == Encoder.STOP_TYPE)
            gfc.blocktype_old[chn] = Encoder.SHORT_TYPE;
        }
        blocktype_d[chn] = gfc.blocktype_old[chn];
        gfc.blocktype_old[chn] = blocktype;
      }
    }
    function vbrpsy_compute_MS_thresholds(eb, thr, cb_mld, ath_cb, athadjust, msfix, n) {
      var msfix2 = msfix * 2;
      var athlower = msfix > 0 ? Math.pow(10, athadjust) : 1;
      var rside, rmid;
      for (var b = 0; b < n; ++b) {
        var ebM = eb[2][b];
        var ebS = eb[3][b];
        var thmL = thr[0][b];
        var thmR = thr[1][b];
        var thmM = thr[2][b];
        var thmS = thr[3][b];
        if (thmL <= 1.58 * thmR && thmR <= 1.58 * thmL) {
          var mld_m = cb_mld[b] * ebS;
          var mld_s = cb_mld[b] * ebM;
          rmid = Math.max(thmM, Math.min(thmS, mld_m));
          rside = Math.max(thmS, Math.min(thmM, mld_s));
        } else {
          rmid = thmM;
          rside = thmS;
        }
        if (msfix > 0) {
          var thmLR, thmMS;
          var ath = ath_cb[b] * athlower;
          thmLR = Math.min(Math.max(thmL, ath), Math.max(thmR, ath));
          thmM = Math.max(rmid, ath);
          thmS = Math.max(rside, ath);
          thmMS = thmM + thmS;
          if (thmMS > 0 && thmLR * msfix2 < thmMS) {
            var f = thmLR * msfix2 / thmMS;
            thmM *= f;
            thmS *= f;
          }
          rmid = Math.min(thmM, rmid);
          rside = Math.min(thmS, rside);
        }
        if (rmid > ebM) {
          rmid = ebM;
        }
        if (rside > ebS) {
          rside = ebS;
        }
        thr[2][b] = rmid;
        thr[3][b] = rside;
      }
    }
    this.L3psycho_anal_vbr = function(gfp, buffer, bufPos, gr_out, masking_ratio, masking_MS_ratio, percep_entropy, percep_MS_entropy, energy, blocktype_d) {
      var gfc = gfp.internal_flags;
      var wsamp_l;
      var wsamp_s;
      var fftenergy = new_float(Encoder.HBLKSIZE);
      var fftenergy_s = new_float_n([3, Encoder.HBLKSIZE_s]);
      var wsamp_L = new_float_n([2, Encoder.BLKSIZE]);
      var wsamp_S = new_float_n([2, 3, Encoder.BLKSIZE_s]);
      var eb = new_float_n([4, Encoder.CBANDS]), thr = new_float_n([4, Encoder.CBANDS]);
      var sub_short_factor = new_float_n([4, 3]);
      var pcfact = 0.6;
      var ns_attacks = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0]
      ];
      var uselongblock = new_int(2);
      var n_chn_psy = gfp.mode == MPEGMode.JOINT_STEREO ? 4 : gfc.channels_out;
      vbrpsy_attack_detection(
        gfp,
        buffer,
        bufPos,
        gr_out,
        masking_ratio,
        masking_MS_ratio,
        energy,
        sub_short_factor,
        ns_attacks,
        uselongblock
      );
      vbrpsy_compute_block_type(gfp, uselongblock);
      {
        for (var chn = 0; chn < n_chn_psy; chn++) {
          var ch01 = chn & 1;
          wsamp_l = wsamp_L;
          vbrpsy_compute_fft_l(
            gfp,
            buffer,
            bufPos,
            chn,
            gr_out,
            fftenergy,
            wsamp_l,
            ch01
          );
          vbrpsy_compute_loudness_approximation_l(
            gfp,
            gr_out,
            chn,
            fftenergy
          );
          if (uselongblock[ch01] != 0) {
            vbrpsy_compute_masking_l(
              gfc,
              fftenergy,
              eb[chn],
              thr[chn],
              chn
            );
          } else {
            vbrpsy_skip_masking_l(gfc, chn);
          }
        }
        if (uselongblock[0] + uselongblock[1] == 2) {
          if (gfp.mode == MPEGMode.JOINT_STEREO) {
            vbrpsy_compute_MS_thresholds(
              eb,
              thr,
              gfc.mld_cb_l,
              gfc.ATH.cb_l,
              gfp.ATHlower * gfc.ATH.adjust,
              gfp.msfix,
              gfc.npart_l
            );
          }
        }
        for (var chn = 0; chn < n_chn_psy; chn++) {
          var ch01 = chn & 1;
          if (uselongblock[ch01] != 0) {
            convert_partition2scalefac_l(gfc, eb[chn], thr[chn], chn);
          }
        }
      }
      {
        for (var sblock = 0; sblock < 3; sblock++) {
          for (var chn = 0; chn < n_chn_psy; ++chn) {
            var ch01 = chn & 1;
            if (uselongblock[ch01] != 0) {
              vbrpsy_skip_masking_s(gfc, chn, sblock);
            } else {
              wsamp_s = wsamp_S;
              vbrpsy_compute_fft_s(
                gfp,
                buffer,
                bufPos,
                chn,
                sblock,
                fftenergy_s,
                wsamp_s,
                ch01
              );
              vbrpsy_compute_masking_s(
                gfp,
                fftenergy_s,
                eb[chn],
                thr[chn],
                chn,
                sblock
              );
            }
          }
          if (uselongblock[0] + uselongblock[1] == 0) {
            if (gfp.mode == MPEGMode.JOINT_STEREO) {
              vbrpsy_compute_MS_thresholds(
                eb,
                thr,
                gfc.mld_cb_s,
                gfc.ATH.cb_s,
                gfp.ATHlower * gfc.ATH.adjust,
                gfp.msfix,
                gfc.npart_s
              );
            }
          }
          for (var chn = 0; chn < n_chn_psy; ++chn) {
            var ch01 = chn & 1;
            if (0 == uselongblock[ch01]) {
              convert_partition2scalefac_s(
                gfc,
                eb[chn],
                thr[chn],
                chn,
                sblock
              );
            }
          }
        }
        for (var chn = 0; chn < n_chn_psy; chn++) {
          var ch01 = chn & 1;
          if (uselongblock[ch01] != 0) {
            continue;
          }
          for (var sb = 0; sb < Encoder.SBMAX_s; sb++) {
            var new_thmm = new_float(3);
            for (var sblock = 0; sblock < 3; sblock++) {
              var thmm = gfc.thm[chn].s[sb][sblock];
              thmm *= NS_PREECHO_ATT0;
              if (ns_attacks[chn][sblock] >= 2 || ns_attacks[chn][sblock + 1] == 1) {
                var idx = sblock != 0 ? sblock - 1 : 2;
                var p = NS_INTERP(
                  gfc.thm[chn].s[sb][idx],
                  thmm,
                  NS_PREECHO_ATT1 * pcfact
                );
                thmm = Math.min(thmm, p);
              } else if (ns_attacks[chn][sblock] == 1) {
                var idx = sblock != 0 ? sblock - 1 : 2;
                var p = NS_INTERP(
                  gfc.thm[chn].s[sb][idx],
                  thmm,
                  NS_PREECHO_ATT2 * pcfact
                );
                thmm = Math.min(thmm, p);
              } else if (sblock != 0 && ns_attacks[chn][sblock - 1] == 3 || sblock == 0 && gfc.nsPsy.lastAttacks[chn] == 3) {
                var idx = sblock != 2 ? sblock + 1 : 0;
                var p = NS_INTERP(
                  gfc.thm[chn].s[sb][idx],
                  thmm,
                  NS_PREECHO_ATT2 * pcfact
                );
                thmm = Math.min(thmm, p);
              }
              thmm *= sub_short_factor[chn][sblock];
              new_thmm[sblock] = thmm;
            }
            for (var sblock = 0; sblock < 3; sblock++) {
              gfc.thm[chn].s[sb][sblock] = new_thmm[sblock];
            }
          }
        }
      }
      for (var chn = 0; chn < n_chn_psy; chn++) {
        gfc.nsPsy.lastAttacks[chn] = ns_attacks[chn][2];
      }
      vbrpsy_apply_block_type(gfp, uselongblock, blocktype_d);
      for (var chn = 0; chn < n_chn_psy; chn++) {
        var ppe;
        var ppePos;
        var type;
        var mr;
        if (chn > 1) {
          ppe = percep_MS_entropy;
          ppePos = -2;
          type = Encoder.NORM_TYPE;
          if (blocktype_d[0] == Encoder.SHORT_TYPE || blocktype_d[1] == Encoder.SHORT_TYPE)
            type = Encoder.SHORT_TYPE;
          mr = masking_MS_ratio[gr_out][chn - 2];
        } else {
          ppe = percep_entropy;
          ppePos = 0;
          type = blocktype_d[chn];
          mr = masking_ratio[gr_out][chn];
        }
        if (type == Encoder.SHORT_TYPE) {
          ppe[ppePos + chn] = pecalc_s(mr, gfc.masking_lower);
        } else {
          ppe[ppePos + chn] = pecalc_l(mr, gfc.masking_lower);
        }
        if (gfp.analysis) {
          gfc.pinfo.pe[gr_out][chn] = ppe[ppePos + chn];
        }
      }
      return 0;
    };
    function s3_func_x(bark, hf_slope) {
      var tempx = bark, tempy;
      if (tempx >= 0) {
        tempy = -tempx * 27;
      } else {
        tempy = tempx * hf_slope;
      }
      if (tempy <= -72) {
        return 0;
      }
      return Math.exp(tempy * LN_TO_LOG10);
    }
    function norm_s3_func_x(hf_slope) {
      var lim_a = 0, lim_b = 0;
      {
        var x = 0, l, h;
        for (x = 0; s3_func_x(x, hf_slope) > 1e-20; x -= 1)
          ;
        l = x;
        h = 0;
        while (Math.abs(h - l) > 1e-12) {
          x = (h + l) / 2;
          if (s3_func_x(x, hf_slope) > 0) {
            h = x;
          } else {
            l = x;
          }
        }
        lim_a = l;
      }
      {
        var x = 0, l, h;
        for (x = 0; s3_func_x(x, hf_slope) > 1e-20; x += 1)
          ;
        l = 0;
        h = x;
        while (Math.abs(h - l) > 1e-12) {
          x = (h + l) / 2;
          if (s3_func_x(x, hf_slope) > 0) {
            l = x;
          } else {
            h = x;
          }
        }
        lim_b = h;
      }
      {
        var sum = 0;
        var m = 1e3;
        var i;
        for (i = 0; i <= m; ++i) {
          var x = lim_a + i * (lim_b - lim_a) / m;
          var y = s3_func_x(x, hf_slope);
          sum += y;
        }
        {
          var norm = (m + 1) / (sum * (lim_b - lim_a));
          return norm;
        }
      }
    }
    function s3_func(bark) {
      var tempx, x, tempy, temp;
      tempx = bark;
      if (tempx >= 0)
        tempx *= 3;
      else
        tempx *= 1.5;
      if (tempx >= 0.5 && tempx <= 2.5) {
        temp = tempx - 0.5;
        x = 8 * (temp * temp - 2 * temp);
      } else
        x = 0;
      tempx += 0.474;
      tempy = 15.811389 + 7.5 * tempx - 17.5 * Math.sqrt(1 + tempx * tempx);
      if (tempy <= -60)
        return 0;
      tempx = Math.exp((x + tempy) * LN_TO_LOG10);
      tempx /= 0.6609193;
      return tempx;
    }
    function freq2bark(freq) {
      if (freq < 0)
        freq = 0;
      freq = freq * 1e-3;
      return 13 * Math.atan(0.76 * freq) + 3.5 * Math.atan(freq * freq / (7.5 * 7.5));
    }
    function init_numline(numlines, bo, bm, bval, bval_width, mld, bo_w, sfreq, blksize, scalepos, deltafreq, sbmax) {
      var b_frq = new_float(Encoder.CBANDS + 1);
      var sample_freq_frac = sfreq / (sbmax > 15 ? 2 * 576 : 2 * 192);
      var partition = new_int(Encoder.HBLKSIZE);
      var i;
      sfreq /= blksize;
      var j = 0;
      var ni = 0;
      for (i = 0; i < Encoder.CBANDS; i++) {
        var bark1;
        var j2;
        bark1 = freq2bark(sfreq * j);
        b_frq[i] = sfreq * j;
        for (j2 = j; freq2bark(sfreq * j2) - bark1 < DELBARK && j2 <= blksize / 2; j2++)
          ;
        numlines[i] = j2 - j;
        ni = i + 1;
        while (j < j2) {
          partition[j++] = i;
        }
        if (j > blksize / 2) {
          j = blksize / 2;
          ++i;
          break;
        }
      }
      b_frq[i] = sfreq * j;
      for (var sfb = 0; sfb < sbmax; sfb++) {
        var i1, i2, start, end;
        var arg;
        start = scalepos[sfb];
        end = scalepos[sfb + 1];
        i1 = 0 | Math.floor(0.5 + deltafreq * (start - 0.5));
        if (i1 < 0)
          i1 = 0;
        i2 = 0 | Math.floor(0.5 + deltafreq * (end - 0.5));
        if (i2 > blksize / 2)
          i2 = blksize / 2;
        bm[sfb] = (partition[i1] + partition[i2]) / 2;
        bo[sfb] = partition[i2];
        var f_tmp = sample_freq_frac * end;
        bo_w[sfb] = (f_tmp - b_frq[bo[sfb]]) / (b_frq[bo[sfb] + 1] - b_frq[bo[sfb]]);
        if (bo_w[sfb] < 0) {
          bo_w[sfb] = 0;
        } else {
          if (bo_w[sfb] > 1) {
            bo_w[sfb] = 1;
          }
        }
        arg = freq2bark(sfreq * scalepos[sfb] * deltafreq);
        arg = Math.min(arg, 15.5) / 15.5;
        mld[sfb] = Math.pow(
          10,
          1.25 * (1 - Math.cos(Math.PI * arg)) - 2.5
        );
      }
      j = 0;
      for (var k = 0; k < ni; k++) {
        var w = numlines[k];
        var bark1, bark2;
        bark1 = freq2bark(sfreq * j);
        bark2 = freq2bark(sfreq * (j + w - 1));
        bval[k] = 0.5 * (bark1 + bark2);
        bark1 = freq2bark(sfreq * (j - 0.5));
        bark2 = freq2bark(sfreq * (j + w - 0.5));
        bval_width[k] = bark2 - bark1;
        j += w;
      }
      return ni;
    }
    function init_s3_values(s3ind, npart, bval, bval_width, norm, use_old_s3) {
      var s3 = new_float_n([Encoder.CBANDS, Encoder.CBANDS]);
      var j;
      var numberOfNoneZero = 0;
      if (use_old_s3) {
        for (var i = 0; i < npart; i++) {
          for (j = 0; j < npart; j++) {
            var v = s3_func(bval[i] - bval[j]) * bval_width[j];
            s3[i][j] = v * norm[i];
          }
        }
      } else {
        for (j = 0; j < npart; j++) {
          var hf_slope = 15 + Math.min(21 / bval[j], 12);
          var s3_x_norm = norm_s3_func_x(hf_slope);
          for (var i = 0; i < npart; i++) {
            var v = s3_x_norm * s3_func_x(bval[i] - bval[j], hf_slope) * bval_width[j];
            s3[i][j] = v * norm[i];
          }
        }
      }
      for (var i = 0; i < npart; i++) {
        for (j = 0; j < npart; j++) {
          if (s3[i][j] > 0)
            break;
        }
        s3ind[i][0] = j;
        for (j = npart - 1; j > 0; j--) {
          if (s3[i][j] > 0)
            break;
        }
        s3ind[i][1] = j;
        numberOfNoneZero += s3ind[i][1] - s3ind[i][0] + 1;
      }
      var p = new_float(numberOfNoneZero);
      var k = 0;
      for (var i = 0; i < npart; i++)
        for (j = s3ind[i][0]; j <= s3ind[i][1]; j++)
          p[k++] = s3[i][j];
      return p;
    }
    function stereo_demask(f) {
      var arg = freq2bark(f);
      arg = Math.min(arg, 15.5) / 15.5;
      return Math.pow(
        10,
        1.25 * (1 - Math.cos(Math.PI * arg)) - 2.5
      );
    }
    this.psymodel_init = function(gfp) {
      var gfc = gfp.internal_flags;
      var i;
      var useOldS3 = true;
      var bvl_a = 13, bvl_b = 24;
      var snr_l_a = 0, snr_l_b = 0;
      var snr_s_a = -8.25, snr_s_b = -4.5;
      var bval = new_float(Encoder.CBANDS);
      var bval_width = new_float(Encoder.CBANDS);
      var norm = new_float(Encoder.CBANDS);
      var sfreq = gfp.out_samplerate;
      switch (gfp.experimentalZ) {
        default:
        case 0:
          useOldS3 = true;
          break;
        case 1:
          useOldS3 = gfp.VBR == VbrMode.vbr_mtrh || gfp.VBR == VbrMode.vbr_mt ? false : true;
          break;
        case 2:
          useOldS3 = false;
          break;
        case 3:
          bvl_a = 8;
          snr_l_a = -1.75;
          snr_l_b = -0.0125;
          snr_s_a = -8.25;
          snr_s_b = -2.25;
          break;
      }
      gfc.ms_ener_ratio_old = 0.25;
      gfc.blocktype_old[0] = gfc.blocktype_old[1] = Encoder.NORM_TYPE;
      for (i = 0; i < 4; ++i) {
        for (var j = 0; j < Encoder.CBANDS; ++j) {
          gfc.nb_1[i][j] = 1e20;
          gfc.nb_2[i][j] = 1e20;
          gfc.nb_s1[i][j] = gfc.nb_s2[i][j] = 1;
        }
        for (var sb = 0; sb < Encoder.SBMAX_l; sb++) {
          gfc.en[i].l[sb] = 1e20;
          gfc.thm[i].l[sb] = 1e20;
        }
        for (var j = 0; j < 3; ++j) {
          for (var sb = 0; sb < Encoder.SBMAX_s; sb++) {
            gfc.en[i].s[sb][j] = 1e20;
            gfc.thm[i].s[sb][j] = 1e20;
          }
          gfc.nsPsy.lastAttacks[i] = 0;
        }
        for (var j = 0; j < 9; j++)
          gfc.nsPsy.last_en_subshort[i][j] = 10;
      }
      gfc.loudness_sq_save[0] = gfc.loudness_sq_save[1] = 0;
      gfc.npart_l = init_numline(
        gfc.numlines_l,
        gfc.bo_l,
        gfc.bm_l,
        bval,
        bval_width,
        gfc.mld_l,
        gfc.PSY.bo_l_weight,
        sfreq,
        Encoder.BLKSIZE,
        gfc.scalefac_band.l,
        Encoder.BLKSIZE / (2 * 576),
        Encoder.SBMAX_l
      );
      for (i = 0; i < gfc.npart_l; i++) {
        var snr = snr_l_a;
        if (bval[i] >= bvl_a) {
          snr = snr_l_b * (bval[i] - bvl_a) / (bvl_b - bvl_a) + snr_l_a * (bvl_b - bval[i]) / (bvl_b - bvl_a);
        }
        norm[i] = Math.pow(10, snr / 10);
        if (gfc.numlines_l[i] > 0) {
          gfc.rnumlines_l[i] = 1 / gfc.numlines_l[i];
        } else {
          gfc.rnumlines_l[i] = 0;
        }
      }
      gfc.s3_ll = init_s3_values(
        gfc.s3ind,
        gfc.npart_l,
        bval,
        bval_width,
        norm,
        useOldS3
      );
      var j = 0;
      for (i = 0; i < gfc.npart_l; i++) {
        var x;
        x = Float.MAX_VALUE;
        for (var k = 0; k < gfc.numlines_l[i]; k++, j++) {
          var freq = sfreq * j / (1e3 * Encoder.BLKSIZE);
          var level;
          level = this.ATHformula(freq * 1e3, gfp) - 20;
          level = Math.pow(10, 0.1 * level);
          level *= gfc.numlines_l[i];
          if (x > level)
            x = level;
        }
        gfc.ATH.cb_l[i] = x;
        x = -20 + bval[i] * 20 / 10;
        if (x > 6) {
          x = 100;
        }
        if (x < -15) {
          x = -15;
        }
        x -= 8;
        gfc.minval_l[i] = Math.pow(10, x / 10) * gfc.numlines_l[i];
      }
      gfc.npart_s = init_numline(
        gfc.numlines_s,
        gfc.bo_s,
        gfc.bm_s,
        bval,
        bval_width,
        gfc.mld_s,
        gfc.PSY.bo_s_weight,
        sfreq,
        Encoder.BLKSIZE_s,
        gfc.scalefac_band.s,
        Encoder.BLKSIZE_s / (2 * 192),
        Encoder.SBMAX_s
      );
      j = 0;
      for (i = 0; i < gfc.npart_s; i++) {
        var x;
        var snr = snr_s_a;
        if (bval[i] >= bvl_a) {
          snr = snr_s_b * (bval[i] - bvl_a) / (bvl_b - bvl_a) + snr_s_a * (bvl_b - bval[i]) / (bvl_b - bvl_a);
        }
        norm[i] = Math.pow(10, snr / 10);
        x = Float.MAX_VALUE;
        for (var k = 0; k < gfc.numlines_s[i]; k++, j++) {
          var freq = sfreq * j / (1e3 * Encoder.BLKSIZE_s);
          var level;
          level = this.ATHformula(freq * 1e3, gfp) - 20;
          level = Math.pow(10, 0.1 * level);
          level *= gfc.numlines_s[i];
          if (x > level)
            x = level;
        }
        gfc.ATH.cb_s[i] = x;
        x = -7 + bval[i] * 7 / 12;
        if (bval[i] > 12) {
          x *= 1 + Math.log(1 + x) * 3.1;
        }
        if (bval[i] < 12) {
          x *= 1 + Math.log(1 - x) * 2.3;
        }
        if (x < -15) {
          x = -15;
        }
        x -= 8;
        gfc.minval_s[i] = Math.pow(10, x / 10) * gfc.numlines_s[i];
      }
      gfc.s3_ss = init_s3_values(
        gfc.s3ind_s,
        gfc.npart_s,
        bval,
        bval_width,
        norm,
        useOldS3
      );
      init_mask_add_max_values();
      fft.init_fft(gfc);
      gfc.decay = Math.exp(-1 * LOG10 / (temporalmask_sustain_sec * sfreq / 192));
      {
        var msfix;
        msfix = NS_MSFIX;
        if ((gfp.exp_nspsytune & 2) != 0)
          msfix = 1;
        if (Math.abs(gfp.msfix) > 0)
          msfix = gfp.msfix;
        gfp.msfix = msfix;
        for (var b = 0; b < gfc.npart_l; b++)
          if (gfc.s3ind[b][1] > gfc.npart_l - 1)
            gfc.s3ind[b][1] = gfc.npart_l - 1;
      }
      var frame_duration = 576 * gfc.mode_gr / sfreq;
      gfc.ATH.decay = Math.pow(10, -12 / 10 * frame_duration);
      gfc.ATH.adjust = 0.01;
      gfc.ATH.adjustLimit = 1;
      if (gfp.ATHtype != -1) {
        var freq;
        var freq_inc = gfp.out_samplerate / Encoder.BLKSIZE;
        var eql_balance = 0;
        freq = 0;
        for (i = 0; i < Encoder.BLKSIZE / 2; ++i) {
          freq += freq_inc;
          gfc.ATH.eql_w[i] = 1 / Math.pow(10, this.ATHformula(freq, gfp) / 10);
          eql_balance += gfc.ATH.eql_w[i];
        }
        eql_balance = 1 / eql_balance;
        for (i = Encoder.BLKSIZE / 2; --i >= 0; ) {
          gfc.ATH.eql_w[i] *= eql_balance;
        }
      }
      {
        for (var b = j = 0; b < gfc.npart_s; ++b) {
          for (i = 0; i < gfc.numlines_s[b]; ++i) {
            ++j;
          }
        }
        for (var b = j = 0; b < gfc.npart_l; ++b) {
          for (i = 0; i < gfc.numlines_l[b]; ++i) {
            ++j;
          }
        }
      }
      j = 0;
      for (i = 0; i < gfc.npart_l; i++) {
        var freq = sfreq * (j + gfc.numlines_l[i] / 2) / (1 * Encoder.BLKSIZE);
        gfc.mld_cb_l[i] = stereo_demask(freq);
        j += gfc.numlines_l[i];
      }
      for (; i < Encoder.CBANDS; ++i) {
        gfc.mld_cb_l[i] = 1;
      }
      j = 0;
      for (i = 0; i < gfc.npart_s; i++) {
        var freq = sfreq * (j + gfc.numlines_s[i] / 2) / (1 * Encoder.BLKSIZE_s);
        gfc.mld_cb_s[i] = stereo_demask(freq);
        j += gfc.numlines_s[i];
      }
      for (; i < Encoder.CBANDS; ++i) {
        gfc.mld_cb_s[i] = 1;
      }
      return 0;
    };
    function ATHformula_GB(f, value) {
      if (f < -0.3)
        f = 3410;
      f /= 1e3;
      f = Math.max(0.1, f);
      var ath = 3.64 * Math.pow(f, -0.8) - 6.8 * Math.exp(-0.6 * Math.pow(f - 3.4, 2)) + 6 * Math.exp(-0.15 * Math.pow(f - 8.7, 2)) + (0.6 + 0.04 * value) * 1e-3 * Math.pow(f, 4);
      return ath;
    }
    this.ATHformula = function(f, gfp) {
      var ath;
      switch (gfp.ATHtype) {
        case 0:
          ath = ATHformula_GB(f, 9);
          break;
        case 1:
          ath = ATHformula_GB(f, -1);
          break;
        case 2:
          ath = ATHformula_GB(f, 0);
          break;
        case 3:
          ath = ATHformula_GB(f, 1) + 6;
          break;
        case 4:
          ath = ATHformula_GB(f, gfp.ATHcurve);
          break;
        default:
          ath = ATHformula_GB(f, 0);
          break;
      }
      return ath;
    };
  }
  function Lame() {
    var self = this;
    var LAME_MAXALBUMART = 128 * 1024;
    Lame.V9 = 410;
    Lame.V8 = 420;
    Lame.V7 = 430;
    Lame.V6 = 440;
    Lame.V5 = 450;
    Lame.V4 = 460;
    Lame.V3 = 470;
    Lame.V2 = 480;
    Lame.V1 = 490;
    Lame.V0 = 500;
    Lame.R3MIX = 1e3;
    Lame.STANDARD = 1001;
    Lame.EXTREME = 1002;
    Lame.INSANE = 1003;
    Lame.STANDARD_FAST = 1004;
    Lame.EXTREME_FAST = 1005;
    Lame.MEDIUM = 1006;
    Lame.MEDIUM_FAST = 1007;
    var LAME_MAXMP3BUFFER = 16384 + LAME_MAXALBUMART;
    Lame.LAME_MAXMP3BUFFER = LAME_MAXMP3BUFFER;
    var ga;
    var bs;
    var p;
    var qupvt;
    var qu;
    var psy = new PsyModel();
    var vbr;
    var ver;
    var id3;
    var mpglib;
    this.enc = new Encoder();
    this.setModules = function(_ga, _bs, _p, _qupvt, _qu, _vbr, _ver, _id3, _mpglib) {
      ga = _ga;
      bs = _bs;
      p = _p;
      qupvt = _qupvt;
      qu = _qu;
      vbr = _vbr;
      ver = _ver;
      id3 = _id3;
      mpglib = _mpglib;
      this.enc.setModules(bs, psy, qupvt, vbr);
    };
    function PSY() {
      this.mask_adjust = 0;
      this.mask_adjust_short = 0;
      this.bo_l_weight = new_float(Encoder.SBMAX_l);
      this.bo_s_weight = new_float(Encoder.SBMAX_s);
    }
    function LowPassHighPass() {
      this.lowerlimit = 0;
    }
    function BandPass(bitrate, lPass) {
      this.lowpass = lPass;
    }
    var LAME_ID = 4294479419;
    function lame_init_old(gfp) {
      var gfc;
      gfp.class_id = LAME_ID;
      gfc = gfp.internal_flags = new LameInternalFlags();
      gfp.mode = MPEGMode.NOT_SET;
      gfp.original = 1;
      gfp.in_samplerate = 44100;
      gfp.num_channels = 2;
      gfp.num_samples = -1;
      gfp.bWriteVbrTag = true;
      gfp.quality = -1;
      gfp.short_blocks = null;
      gfc.subblock_gain = -1;
      gfp.lowpassfreq = 0;
      gfp.highpassfreq = 0;
      gfp.lowpasswidth = -1;
      gfp.highpasswidth = -1;
      gfp.VBR = VbrMode.vbr_off;
      gfp.VBR_q = 4;
      gfp.ATHcurve = -1;
      gfp.VBR_mean_bitrate_kbps = 128;
      gfp.VBR_min_bitrate_kbps = 0;
      gfp.VBR_max_bitrate_kbps = 0;
      gfp.VBR_hard_min = 0;
      gfc.VBR_min_bitrate = 1;
      gfc.VBR_max_bitrate = 13;
      gfp.quant_comp = -1;
      gfp.quant_comp_short = -1;
      gfp.msfix = -1;
      gfc.resample_ratio = 1;
      gfc.OldValue[0] = 180;
      gfc.OldValue[1] = 180;
      gfc.CurrentStep[0] = 4;
      gfc.CurrentStep[1] = 4;
      gfc.masking_lower = 1;
      gfc.nsPsy.attackthre = -1;
      gfc.nsPsy.attackthre_s = -1;
      gfp.scale = -1;
      gfp.athaa_type = -1;
      gfp.ATHtype = -1;
      gfp.athaa_loudapprox = -1;
      gfp.athaa_sensitivity = 0;
      gfp.useTemporal = null;
      gfp.interChRatio = -1;
      gfc.mf_samples_to_encode = Encoder.ENCDELAY + Encoder.POSTDELAY;
      gfp.encoder_padding = 0;
      gfc.mf_size = Encoder.ENCDELAY - Encoder.MDCTDELAY;
      gfp.findReplayGain = false;
      gfp.decode_on_the_fly = false;
      gfc.decode_on_the_fly = false;
      gfc.findReplayGain = false;
      gfc.findPeakSample = false;
      gfc.RadioGain = 0;
      gfc.AudiophileGain = 0;
      gfc.noclipGainChange = 0;
      gfc.noclipScale = -1;
      gfp.preset = 0;
      gfp.write_id3tag_automatic = true;
      return 0;
    }
    this.lame_init = function() {
      var gfp = new LameGlobalFlags();
      var ret = lame_init_old(gfp);
      if (ret != 0) {
        return null;
      }
      gfp.lame_allocated_gfp = 1;
      return gfp;
    };
    function filter_coef(x) {
      if (x > 1)
        return 0;
      if (x <= 0)
        return 1;
      return Math.cos(Math.PI / 2 * x);
    }
    this.nearestBitrateFullIndex = function(bitrate) {
      var full_bitrate_table = [
        8,
        16,
        24,
        32,
        40,
        48,
        56,
        64,
        80,
        96,
        112,
        128,
        160,
        192,
        224,
        256,
        320
      ];
      var lower_range = 0, lower_range_kbps = 0, upper_range = 0, upper_range_kbps = 0;
      upper_range_kbps = full_bitrate_table[16];
      upper_range = 16;
      lower_range_kbps = full_bitrate_table[16];
      lower_range = 16;
      for (var b = 0; b < 16; b++) {
        if (Math.max(bitrate, full_bitrate_table[b + 1]) != bitrate) {
          upper_range_kbps = full_bitrate_table[b + 1];
          upper_range = b + 1;
          lower_range_kbps = full_bitrate_table[b];
          lower_range = b;
          break;
        }
      }
      if (upper_range_kbps - bitrate > bitrate - lower_range_kbps) {
        return lower_range;
      }
      return upper_range;
    };
    function optimum_samplefreq(lowpassfreq, input_samplefreq) {
      var suggested_samplefreq = 44100;
      if (input_samplefreq >= 48e3)
        suggested_samplefreq = 48e3;
      else if (input_samplefreq >= 44100)
        suggested_samplefreq = 44100;
      else if (input_samplefreq >= 32e3)
        suggested_samplefreq = 32e3;
      else if (input_samplefreq >= 24e3)
        suggested_samplefreq = 24e3;
      else if (input_samplefreq >= 22050)
        suggested_samplefreq = 22050;
      else if (input_samplefreq >= 16e3)
        suggested_samplefreq = 16e3;
      else if (input_samplefreq >= 12e3)
        suggested_samplefreq = 12e3;
      else if (input_samplefreq >= 11025)
        suggested_samplefreq = 11025;
      else if (input_samplefreq >= 8e3)
        suggested_samplefreq = 8e3;
      if (lowpassfreq == -1)
        return suggested_samplefreq;
      if (lowpassfreq <= 15960)
        suggested_samplefreq = 44100;
      if (lowpassfreq <= 15250)
        suggested_samplefreq = 32e3;
      if (lowpassfreq <= 11220)
        suggested_samplefreq = 24e3;
      if (lowpassfreq <= 9970)
        suggested_samplefreq = 22050;
      if (lowpassfreq <= 7230)
        suggested_samplefreq = 16e3;
      if (lowpassfreq <= 5420)
        suggested_samplefreq = 12e3;
      if (lowpassfreq <= 4510)
        suggested_samplefreq = 11025;
      if (lowpassfreq <= 3970)
        suggested_samplefreq = 8e3;
      if (input_samplefreq < suggested_samplefreq) {
        if (input_samplefreq > 44100) {
          return 48e3;
        }
        if (input_samplefreq > 32e3) {
          return 44100;
        }
        if (input_samplefreq > 24e3) {
          return 32e3;
        }
        if (input_samplefreq > 22050) {
          return 24e3;
        }
        if (input_samplefreq > 16e3) {
          return 22050;
        }
        if (input_samplefreq > 12e3) {
          return 16e3;
        }
        if (input_samplefreq > 11025) {
          return 12e3;
        }
        if (input_samplefreq > 8e3) {
          return 11025;
        }
        return 8e3;
      }
      return suggested_samplefreq;
    }
    function SmpFrqIndex(sample_freq, gpf) {
      switch (sample_freq) {
        case 44100:
          gpf.version = 1;
          return 0;
        case 48e3:
          gpf.version = 1;
          return 1;
        case 32e3:
          gpf.version = 1;
          return 2;
        case 22050:
          gpf.version = 0;
          return 0;
        case 24e3:
          gpf.version = 0;
          return 1;
        case 16e3:
          gpf.version = 0;
          return 2;
        case 11025:
          gpf.version = 0;
          return 0;
        case 12e3:
          gpf.version = 0;
          return 1;
        case 8e3:
          gpf.version = 0;
          return 2;
        default:
          gpf.version = 0;
          return -1;
      }
    }
    function FindNearestBitrate(bRate, version, samplerate) {
      if (samplerate < 16e3)
        version = 2;
      var bitrate = Tables.bitrate_table[version][1];
      for (var i = 2; i <= 14; i++) {
        if (Tables.bitrate_table[version][i] > 0) {
          if (Math.abs(Tables.bitrate_table[version][i] - bRate) < Math.abs(bitrate - bRate))
            bitrate = Tables.bitrate_table[version][i];
        }
      }
      return bitrate;
    }
    function BitrateIndex(bRate, version, samplerate) {
      if (samplerate < 16e3)
        version = 2;
      for (var i = 0; i <= 14; i++) {
        if (Tables.bitrate_table[version][i] > 0) {
          if (Tables.bitrate_table[version][i] == bRate) {
            return i;
          }
        }
      }
      return -1;
    }
    function optimum_bandwidth(lh, bitrate) {
      var freq_map = [
        new BandPass(8, 2e3),
        new BandPass(16, 3700),
        new BandPass(24, 3900),
        new BandPass(32, 5500),
        new BandPass(40, 7e3),
        new BandPass(48, 7500),
        new BandPass(56, 1e4),
        new BandPass(64, 11e3),
        new BandPass(80, 13500),
        new BandPass(96, 15100),
        new BandPass(112, 15600),
        new BandPass(128, 17e3),
        new BandPass(160, 17500),
        new BandPass(192, 18600),
        new BandPass(224, 19400),
        new BandPass(256, 19700),
        new BandPass(320, 20500)
      ];
      var table_index = self.nearestBitrateFullIndex(bitrate);
      lh.lowerlimit = freq_map[table_index].lowpass;
    }
    function lame_init_params_ppflt(gfp) {
      var gfc = gfp.internal_flags;
      var lowpass_band = 32;
      var highpass_band = -1;
      if (gfc.lowpass1 > 0) {
        var minband = 999;
        for (var band = 0; band <= 31; band++) {
          var freq = band / 31;
          if (freq >= gfc.lowpass2) {
            lowpass_band = Math.min(lowpass_band, band);
          }
          if (gfc.lowpass1 < freq && freq < gfc.lowpass2) {
            minband = Math.min(minband, band);
          }
        }
        if (minband == 999) {
          gfc.lowpass1 = (lowpass_band - 0.75) / 31;
        } else {
          gfc.lowpass1 = (minband - 0.75) / 31;
        }
        gfc.lowpass2 = lowpass_band / 31;
      }
      if (gfc.highpass2 > 0) {
        if (gfc.highpass2 < 0.9 * (0.75 / 31)) {
          gfc.highpass1 = 0;
          gfc.highpass2 = 0;
          System.err.println("Warning: highpass filter disabled.  highpass frequency too small\n");
        }
      }
      if (gfc.highpass2 > 0) {
        var maxband = -1;
        for (var band = 0; band <= 31; band++) {
          var freq = band / 31;
          if (freq <= gfc.highpass1) {
            highpass_band = Math.max(highpass_band, band);
          }
          if (gfc.highpass1 < freq && freq < gfc.highpass2) {
            maxband = Math.max(maxband, band);
          }
        }
        gfc.highpass1 = highpass_band / 31;
        if (maxband == -1) {
          gfc.highpass2 = (highpass_band + 0.75) / 31;
        } else {
          gfc.highpass2 = (maxband + 0.75) / 31;
        }
      }
      for (var band = 0; band < 32; band++) {
        var fc1, fc2;
        var freq = band / 31;
        if (gfc.highpass2 > gfc.highpass1) {
          fc1 = filter_coef((gfc.highpass2 - freq) / (gfc.highpass2 - gfc.highpass1 + 1e-20));
        } else {
          fc1 = 1;
        }
        if (gfc.lowpass2 > gfc.lowpass1) {
          fc2 = filter_coef((freq - gfc.lowpass1) / (gfc.lowpass2 - gfc.lowpass1 + 1e-20));
        } else {
          fc2 = 1;
        }
        gfc.amp_filter[band] = fc1 * fc2;
      }
    }
    function lame_init_qval(gfp) {
      var gfc = gfp.internal_flags;
      switch (gfp.quality) {
        default:
        case 9:
          gfc.psymodel = 0;
          gfc.noise_shaping = 0;
          gfc.noise_shaping_amp = 0;
          gfc.noise_shaping_stop = 0;
          gfc.use_best_huffman = 0;
          gfc.full_outer_loop = 0;
          break;
        case 8:
          gfp.quality = 7;
        //$FALL-THROUGH$
        case 7:
          gfc.psymodel = 1;
          gfc.noise_shaping = 0;
          gfc.noise_shaping_amp = 0;
          gfc.noise_shaping_stop = 0;
          gfc.use_best_huffman = 0;
          gfc.full_outer_loop = 0;
          break;
        case 6:
          gfc.psymodel = 1;
          if (gfc.noise_shaping == 0)
            gfc.noise_shaping = 1;
          gfc.noise_shaping_amp = 0;
          gfc.noise_shaping_stop = 0;
          if (gfc.subblock_gain == -1)
            gfc.subblock_gain = 1;
          gfc.use_best_huffman = 0;
          gfc.full_outer_loop = 0;
          break;
        case 5:
          gfc.psymodel = 1;
          if (gfc.noise_shaping == 0)
            gfc.noise_shaping = 1;
          gfc.noise_shaping_amp = 0;
          gfc.noise_shaping_stop = 0;
          if (gfc.subblock_gain == -1)
            gfc.subblock_gain = 1;
          gfc.use_best_huffman = 0;
          gfc.full_outer_loop = 0;
          break;
        case 4:
          gfc.psymodel = 1;
          if (gfc.noise_shaping == 0)
            gfc.noise_shaping = 1;
          gfc.noise_shaping_amp = 0;
          gfc.noise_shaping_stop = 0;
          if (gfc.subblock_gain == -1)
            gfc.subblock_gain = 1;
          gfc.use_best_huffman = 1;
          gfc.full_outer_loop = 0;
          break;
        case 3:
          gfc.psymodel = 1;
          if (gfc.noise_shaping == 0)
            gfc.noise_shaping = 1;
          gfc.noise_shaping_amp = 1;
          gfc.noise_shaping_stop = 1;
          if (gfc.subblock_gain == -1)
            gfc.subblock_gain = 1;
          gfc.use_best_huffman = 1;
          gfc.full_outer_loop = 0;
          break;
        case 2:
          gfc.psymodel = 1;
          if (gfc.noise_shaping == 0)
            gfc.noise_shaping = 1;
          if (gfc.substep_shaping == 0)
            gfc.substep_shaping = 2;
          gfc.noise_shaping_amp = 1;
          gfc.noise_shaping_stop = 1;
          if (gfc.subblock_gain == -1)
            gfc.subblock_gain = 1;
          gfc.use_best_huffman = 1;
          gfc.full_outer_loop = 0;
          break;
        case 1:
          gfc.psymodel = 1;
          if (gfc.noise_shaping == 0)
            gfc.noise_shaping = 1;
          if (gfc.substep_shaping == 0)
            gfc.substep_shaping = 2;
          gfc.noise_shaping_amp = 2;
          gfc.noise_shaping_stop = 1;
          if (gfc.subblock_gain == -1)
            gfc.subblock_gain = 1;
          gfc.use_best_huffman = 1;
          gfc.full_outer_loop = 0;
          break;
        case 0:
          gfc.psymodel = 1;
          if (gfc.noise_shaping == 0)
            gfc.noise_shaping = 1;
          if (gfc.substep_shaping == 0)
            gfc.substep_shaping = 2;
          gfc.noise_shaping_amp = 2;
          gfc.noise_shaping_stop = 1;
          if (gfc.subblock_gain == -1)
            gfc.subblock_gain = 1;
          gfc.use_best_huffman = 1;
          gfc.full_outer_loop = 0;
          break;
      }
    }
    function lame_init_bitstream(gfp) {
      var gfc = gfp.internal_flags;
      gfp.frameNum = 0;
      if (gfp.write_id3tag_automatic) {
        id3.id3tag_write_v2(gfp);
      }
      gfc.bitrate_stereoMode_Hist = new_int_n([16, 4 + 1]);
      gfc.bitrate_blockType_Hist = new_int_n([16, 4 + 1 + 1]);
      gfc.PeakSample = 0;
      if (gfp.bWriteVbrTag)
        vbr.InitVbrTag(gfp);
    }
    this.lame_init_params = function(gfp) {
      var gfc = gfp.internal_flags;
      gfc.Class_ID = 0;
      if (gfc.ATH == null)
        gfc.ATH = new ATH();
      if (gfc.PSY == null)
        gfc.PSY = new PSY();
      if (gfc.rgdata == null)
        gfc.rgdata = new ReplayGain();
      gfc.channels_in = gfp.num_channels;
      if (gfc.channels_in == 1)
        gfp.mode = MPEGMode.MONO;
      gfc.channels_out = gfp.mode == MPEGMode.MONO ? 1 : 2;
      gfc.mode_ext = Encoder.MPG_MD_MS_LR;
      if (gfp.mode == MPEGMode.MONO)
        gfp.force_ms = false;
      if (gfp.VBR == VbrMode.vbr_off && gfp.VBR_mean_bitrate_kbps != 128 && gfp.brate == 0)
        gfp.brate = gfp.VBR_mean_bitrate_kbps;
      if (gfp.VBR == VbrMode.vbr_off || gfp.VBR == VbrMode.vbr_mtrh || gfp.VBR == VbrMode.vbr_mt) {
      } else {
        gfp.free_format = false;
      }
      if (gfp.VBR == VbrMode.vbr_off && gfp.brate == 0) {
        if (BitStream.EQ(gfp.compression_ratio, 0))
          gfp.compression_ratio = 11.025;
      }
      if (gfp.VBR == VbrMode.vbr_off && gfp.compression_ratio > 0) {
        if (gfp.out_samplerate == 0)
          gfp.out_samplerate = map2MP3Frequency(int(0.97 * gfp.in_samplerate));
        gfp.brate = 0 | gfp.out_samplerate * 16 * gfc.channels_out / (1e3 * gfp.compression_ratio);
        gfc.samplerate_index = SmpFrqIndex(gfp.out_samplerate, gfp);
        if (!gfp.free_format)
          gfp.brate = FindNearestBitrate(
            gfp.brate,
            gfp.version,
            gfp.out_samplerate
          );
      }
      if (gfp.out_samplerate != 0) {
        if (gfp.out_samplerate < 16e3) {
          gfp.VBR_mean_bitrate_kbps = Math.max(
            gfp.VBR_mean_bitrate_kbps,
            8
          );
          gfp.VBR_mean_bitrate_kbps = Math.min(
            gfp.VBR_mean_bitrate_kbps,
            64
          );
        } else if (gfp.out_samplerate < 32e3) {
          gfp.VBR_mean_bitrate_kbps = Math.max(
            gfp.VBR_mean_bitrate_kbps,
            8
          );
          gfp.VBR_mean_bitrate_kbps = Math.min(
            gfp.VBR_mean_bitrate_kbps,
            160
          );
        } else {
          gfp.VBR_mean_bitrate_kbps = Math.max(
            gfp.VBR_mean_bitrate_kbps,
            32
          );
          gfp.VBR_mean_bitrate_kbps = Math.min(
            gfp.VBR_mean_bitrate_kbps,
            320
          );
        }
      }
      if (gfp.lowpassfreq == 0) {
        var lowpass = 16e3;
        switch (gfp.VBR) {
          case VbrMode.vbr_off: {
            var lh = new LowPassHighPass();
            optimum_bandwidth(lh, gfp.brate);
            lowpass = lh.lowerlimit;
            break;
          }
          case VbrMode.vbr_abr: {
            var lh = new LowPassHighPass();
            optimum_bandwidth(lh, gfp.VBR_mean_bitrate_kbps);
            lowpass = lh.lowerlimit;
            break;
          }
          case VbrMode.vbr_rh: {
            var x = [
              19500,
              19e3,
              18600,
              18e3,
              17500,
              16e3,
              15600,
              14900,
              12500,
              1e4,
              3950
            ];
            if (0 <= gfp.VBR_q && gfp.VBR_q <= 9) {
              var a = x[gfp.VBR_q], b = x[gfp.VBR_q + 1], m = gfp.VBR_q_frac;
              lowpass = linear_int(a, b, m);
            } else {
              lowpass = 19500;
            }
            break;
          }
          default: {
            var x = [
              19500,
              19e3,
              18500,
              18e3,
              17500,
              16500,
              15500,
              14500,
              12500,
              9500,
              3950
            ];
            if (0 <= gfp.VBR_q && gfp.VBR_q <= 9) {
              var a = x[gfp.VBR_q], b = x[gfp.VBR_q + 1], m = gfp.VBR_q_frac;
              lowpass = linear_int(a, b, m);
            } else {
              lowpass = 19500;
            }
          }
        }
        if (gfp.mode == MPEGMode.MONO && (gfp.VBR == VbrMode.vbr_off || gfp.VBR == VbrMode.vbr_abr))
          lowpass *= 1.5;
        gfp.lowpassfreq = lowpass | 0;
      }
      if (gfp.out_samplerate == 0) {
        if (2 * gfp.lowpassfreq > gfp.in_samplerate) {
          gfp.lowpassfreq = gfp.in_samplerate / 2;
        }
        gfp.out_samplerate = optimum_samplefreq(
          gfp.lowpassfreq | 0,
          gfp.in_samplerate
        );
      }
      gfp.lowpassfreq = Math.min(20500, gfp.lowpassfreq);
      gfp.lowpassfreq = Math.min(gfp.out_samplerate / 2, gfp.lowpassfreq);
      if (gfp.VBR == VbrMode.vbr_off) {
        gfp.compression_ratio = gfp.out_samplerate * 16 * gfc.channels_out / (1e3 * gfp.brate);
      }
      if (gfp.VBR == VbrMode.vbr_abr) {
        gfp.compression_ratio = gfp.out_samplerate * 16 * gfc.channels_out / (1e3 * gfp.VBR_mean_bitrate_kbps);
      }
      if (!gfp.bWriteVbrTag) {
        gfp.findReplayGain = false;
        gfp.decode_on_the_fly = false;
        gfc.findPeakSample = false;
      }
      gfc.findReplayGain = gfp.findReplayGain;
      gfc.decode_on_the_fly = gfp.decode_on_the_fly;
      if (gfc.decode_on_the_fly)
        gfc.findPeakSample = true;
      if (gfc.findReplayGain) {
        if (ga.InitGainAnalysis(gfc.rgdata, gfp.out_samplerate) == GainAnalysis.INIT_GAIN_ANALYSIS_ERROR) {
          gfp.internal_flags = null;
          return -6;
        }
      }
      if (gfc.decode_on_the_fly && !gfp.decode_only) {
        if (gfc.hip != null) {
          mpglib.hip_decode_exit(gfc.hip);
        }
        gfc.hip = mpglib.hip_decode_init();
      }
      gfc.mode_gr = gfp.out_samplerate <= 24e3 ? 1 : 2;
      gfp.framesize = 576 * gfc.mode_gr;
      gfp.encoder_delay = Encoder.ENCDELAY;
      gfc.resample_ratio = gfp.in_samplerate / gfp.out_samplerate;
      switch (gfp.VBR) {
        case VbrMode.vbr_mt:
        case VbrMode.vbr_rh:
        case VbrMode.vbr_mtrh:
          {
            var cmp = [
              5.7,
              6.5,
              7.3,
              8.2,
              10,
              11.9,
              13,
              14,
              15,
              16.5
            ];
            gfp.compression_ratio = cmp[gfp.VBR_q];
          }
          break;
        case VbrMode.vbr_abr:
          gfp.compression_ratio = gfp.out_samplerate * 16 * gfc.channels_out / (1e3 * gfp.VBR_mean_bitrate_kbps);
          break;
        default:
          gfp.compression_ratio = gfp.out_samplerate * 16 * gfc.channels_out / (1e3 * gfp.brate);
          break;
      }
      if (gfp.mode == MPEGMode.NOT_SET) {
        gfp.mode = MPEGMode.JOINT_STEREO;
      }
      if (gfp.highpassfreq > 0) {
        gfc.highpass1 = 2 * gfp.highpassfreq;
        if (gfp.highpasswidth >= 0)
          gfc.highpass2 = 2 * (gfp.highpassfreq + gfp.highpasswidth);
        else
          gfc.highpass2 = (1 + 0) * 2 * gfp.highpassfreq;
        gfc.highpass1 /= gfp.out_samplerate;
        gfc.highpass2 /= gfp.out_samplerate;
      } else {
        gfc.highpass1 = 0;
        gfc.highpass2 = 0;
      }
      if (gfp.lowpassfreq > 0) {
        gfc.lowpass2 = 2 * gfp.lowpassfreq;
        if (gfp.lowpasswidth >= 0) {
          gfc.lowpass1 = 2 * (gfp.lowpassfreq - gfp.lowpasswidth);
          if (gfc.lowpass1 < 0)
            gfc.lowpass1 = 0;
        } else {
          gfc.lowpass1 = (1 - 0) * 2 * gfp.lowpassfreq;
        }
        gfc.lowpass1 /= gfp.out_samplerate;
        gfc.lowpass2 /= gfp.out_samplerate;
      } else {
        gfc.lowpass1 = 0;
        gfc.lowpass2 = 0;
      }
      lame_init_params_ppflt(gfp);
      gfc.samplerate_index = SmpFrqIndex(gfp.out_samplerate, gfp);
      if (gfc.samplerate_index < 0) {
        gfp.internal_flags = null;
        return -1;
      }
      if (gfp.VBR == VbrMode.vbr_off) {
        if (gfp.free_format) {
          gfc.bitrate_index = 0;
        } else {
          gfp.brate = FindNearestBitrate(
            gfp.brate,
            gfp.version,
            gfp.out_samplerate
          );
          gfc.bitrate_index = BitrateIndex(
            gfp.brate,
            gfp.version,
            gfp.out_samplerate
          );
          if (gfc.bitrate_index <= 0) {
            gfp.internal_flags = null;
            return -1;
          }
        }
      } else {
        gfc.bitrate_index = 1;
      }
      if (gfp.analysis)
        gfp.bWriteVbrTag = false;
      if (gfc.pinfo != null)
        gfp.bWriteVbrTag = false;
      bs.init_bit_stream_w(gfc);
      var j = gfc.samplerate_index + 3 * gfp.version + 6 * (gfp.out_samplerate < 16e3 ? 1 : 0);
      for (var i = 0; i < Encoder.SBMAX_l + 1; i++)
        gfc.scalefac_band.l[i] = qupvt.sfBandIndex[j].l[i];
      for (var i = 0; i < Encoder.PSFB21 + 1; i++) {
        var size = (gfc.scalefac_band.l[22] - gfc.scalefac_band.l[21]) / Encoder.PSFB21;
        var start = gfc.scalefac_band.l[21] + i * size;
        gfc.scalefac_band.psfb21[i] = start;
      }
      gfc.scalefac_band.psfb21[Encoder.PSFB21] = 576;
      for (var i = 0; i < Encoder.SBMAX_s + 1; i++)
        gfc.scalefac_band.s[i] = qupvt.sfBandIndex[j].s[i];
      for (var i = 0; i < Encoder.PSFB12 + 1; i++) {
        var size = (gfc.scalefac_band.s[13] - gfc.scalefac_band.s[12]) / Encoder.PSFB12;
        var start = gfc.scalefac_band.s[12] + i * size;
        gfc.scalefac_band.psfb12[i] = start;
      }
      gfc.scalefac_band.psfb12[Encoder.PSFB12] = 192;
      if (gfp.version == 1)
        gfc.sideinfo_len = gfc.channels_out == 1 ? 4 + 17 : 4 + 32;
      else
        gfc.sideinfo_len = gfc.channels_out == 1 ? 4 + 9 : 4 + 17;
      if (gfp.error_protection)
        gfc.sideinfo_len += 2;
      lame_init_bitstream(gfp);
      gfc.Class_ID = LAME_ID;
      {
        var k;
        for (k = 0; k < 19; k++)
          gfc.nsPsy.pefirbuf[k] = 700 * gfc.mode_gr * gfc.channels_out;
        if (gfp.ATHtype == -1)
          gfp.ATHtype = 4;
      }
      switch (gfp.VBR) {
        case VbrMode.vbr_mt:
          gfp.VBR = VbrMode.vbr_mtrh;
        //$FALL-THROUGH$
        case VbrMode.vbr_mtrh: {
          if (gfp.useTemporal == null) {
            gfp.useTemporal = false;
          }
          p.apply_preset(gfp, 500 - gfp.VBR_q * 10, 0);
          if (gfp.quality < 0)
            gfp.quality = LAME_DEFAULT_QUALITY;
          if (gfp.quality < 5)
            gfp.quality = 0;
          if (gfp.quality > 5)
            gfp.quality = 5;
          gfc.PSY.mask_adjust = gfp.maskingadjust;
          gfc.PSY.mask_adjust_short = gfp.maskingadjust_short;
          if (gfp.experimentalY)
            gfc.sfb21_extra = false;
          else
            gfc.sfb21_extra = gfp.out_samplerate > 44e3;
          gfc.iteration_loop = new VBRNewIterationLoop(qu);
          break;
        }
        case VbrMode.vbr_rh: {
          p.apply_preset(gfp, 500 - gfp.VBR_q * 10, 0);
          gfc.PSY.mask_adjust = gfp.maskingadjust;
          gfc.PSY.mask_adjust_short = gfp.maskingadjust_short;
          if (gfp.experimentalY)
            gfc.sfb21_extra = false;
          else
            gfc.sfb21_extra = gfp.out_samplerate > 44e3;
          if (gfp.quality > 6)
            gfp.quality = 6;
          if (gfp.quality < 0)
            gfp.quality = LAME_DEFAULT_QUALITY;
          gfc.iteration_loop = new VBROldIterationLoop(qu);
          break;
        }
        default: {
          var vbrmode;
          gfc.sfb21_extra = false;
          if (gfp.quality < 0)
            gfp.quality = LAME_DEFAULT_QUALITY;
          vbrmode = gfp.VBR;
          if (vbrmode == VbrMode.vbr_off)
            gfp.VBR_mean_bitrate_kbps = gfp.brate;
          p.apply_preset(gfp, gfp.VBR_mean_bitrate_kbps, 0);
          gfp.VBR = vbrmode;
          gfc.PSY.mask_adjust = gfp.maskingadjust;
          gfc.PSY.mask_adjust_short = gfp.maskingadjust_short;
          if (vbrmode == VbrMode.vbr_off) {
            gfc.iteration_loop = new CBRNewIterationLoop(qu);
          } else {
            gfc.iteration_loop = new ABRIterationLoop(qu);
          }
          break;
        }
      }
      if (gfp.VBR != VbrMode.vbr_off) {
        gfc.VBR_min_bitrate = 1;
        gfc.VBR_max_bitrate = 14;
        if (gfp.out_samplerate < 16e3)
          gfc.VBR_max_bitrate = 8;
        if (gfp.VBR_min_bitrate_kbps != 0) {
          gfp.VBR_min_bitrate_kbps = FindNearestBitrate(
            gfp.VBR_min_bitrate_kbps,
            gfp.version,
            gfp.out_samplerate
          );
          gfc.VBR_min_bitrate = BitrateIndex(
            gfp.VBR_min_bitrate_kbps,
            gfp.version,
            gfp.out_samplerate
          );
          if (gfc.VBR_min_bitrate < 0)
            return -1;
        }
        if (gfp.VBR_max_bitrate_kbps != 0) {
          gfp.VBR_max_bitrate_kbps = FindNearestBitrate(
            gfp.VBR_max_bitrate_kbps,
            gfp.version,
            gfp.out_samplerate
          );
          gfc.VBR_max_bitrate = BitrateIndex(
            gfp.VBR_max_bitrate_kbps,
            gfp.version,
            gfp.out_samplerate
          );
          if (gfc.VBR_max_bitrate < 0)
            return -1;
        }
        gfp.VBR_min_bitrate_kbps = Tables.bitrate_table[gfp.version][gfc.VBR_min_bitrate];
        gfp.VBR_max_bitrate_kbps = Tables.bitrate_table[gfp.version][gfc.VBR_max_bitrate];
        gfp.VBR_mean_bitrate_kbps = Math.min(
          Tables.bitrate_table[gfp.version][gfc.VBR_max_bitrate],
          gfp.VBR_mean_bitrate_kbps
        );
        gfp.VBR_mean_bitrate_kbps = Math.max(
          Tables.bitrate_table[gfp.version][gfc.VBR_min_bitrate],
          gfp.VBR_mean_bitrate_kbps
        );
      }
      if (gfp.tune) {
        gfc.PSY.mask_adjust += gfp.tune_value_a;
        gfc.PSY.mask_adjust_short += gfp.tune_value_a;
      }
      lame_init_qval(gfp);
      if (gfp.athaa_type < 0)
        gfc.ATH.useAdjust = 3;
      else
        gfc.ATH.useAdjust = gfp.athaa_type;
      gfc.ATH.aaSensitivityP = Math.pow(10, gfp.athaa_sensitivity / -10);
      if (gfp.short_blocks == null) {
        gfp.short_blocks = ShortBlock.short_block_allowed;
      }
      if (gfp.short_blocks == ShortBlock.short_block_allowed && (gfp.mode == MPEGMode.JOINT_STEREO || gfp.mode == MPEGMode.STEREO)) {
        gfp.short_blocks = ShortBlock.short_block_coupled;
      }
      if (gfp.quant_comp < 0)
        gfp.quant_comp = 1;
      if (gfp.quant_comp_short < 0)
        gfp.quant_comp_short = 0;
      if (gfp.msfix < 0)
        gfp.msfix = 0;
      gfp.exp_nspsytune = gfp.exp_nspsytune | 1;
      if (gfp.internal_flags.nsPsy.attackthre < 0)
        gfp.internal_flags.nsPsy.attackthre = PsyModel.NSATTACKTHRE;
      if (gfp.internal_flags.nsPsy.attackthre_s < 0)
        gfp.internal_flags.nsPsy.attackthre_s = PsyModel.NSATTACKTHRE_S;
      if (gfp.scale < 0)
        gfp.scale = 1;
      if (gfp.ATHtype < 0)
        gfp.ATHtype = 4;
      if (gfp.ATHcurve < 0)
        gfp.ATHcurve = 4;
      if (gfp.athaa_loudapprox < 0)
        gfp.athaa_loudapprox = 2;
      if (gfp.interChRatio < 0)
        gfp.interChRatio = 0;
      if (gfp.useTemporal == null)
        gfp.useTemporal = true;
      gfc.slot_lag = gfc.frac_SpF = 0;
      if (gfp.VBR == VbrMode.vbr_off)
        gfc.slot_lag = gfc.frac_SpF = (gfp.version + 1) * 72e3 * gfp.brate % gfp.out_samplerate | 0;
      qupvt.iteration_init(gfp);
      psy.psymodel_init(gfp);
      return 0;
    };
    function update_inbuffer_size(gfc, nsamples) {
      if (gfc.in_buffer_0 == null || gfc.in_buffer_nsamples < nsamples) {
        gfc.in_buffer_0 = new_float(nsamples);
        gfc.in_buffer_1 = new_float(nsamples);
        gfc.in_buffer_nsamples = nsamples;
      }
    }
    this.lame_encode_flush = function(gfp, mp3buffer, mp3bufferPos, mp3buffer_size) {
      var gfc = gfp.internal_flags;
      var buffer = new_short_n([2, 1152]);
      var imp3 = 0, mp3count, mp3buffer_size_remaining;
      var end_padding;
      var frames_left;
      var samples_to_encode = gfc.mf_samples_to_encode - Encoder.POSTDELAY;
      var mf_needed = calcNeeded(gfp);
      if (gfc.mf_samples_to_encode < 1) {
        return 0;
      }
      mp3count = 0;
      if (gfp.in_samplerate != gfp.out_samplerate) {
        samples_to_encode += 16 * gfp.out_samplerate / gfp.in_samplerate;
      }
      end_padding = gfp.framesize - samples_to_encode % gfp.framesize;
      if (end_padding < 576)
        end_padding += gfp.framesize;
      gfp.encoder_padding = end_padding;
      frames_left = (samples_to_encode + end_padding) / gfp.framesize;
      while (frames_left > 0 && imp3 >= 0) {
        var bunch = mf_needed - gfc.mf_size;
        var frame_num = gfp.frameNum;
        bunch *= gfp.in_samplerate;
        bunch /= gfp.out_samplerate;
        if (bunch > 1152)
          bunch = 1152;
        if (bunch < 1)
          bunch = 1;
        mp3buffer_size_remaining = mp3buffer_size - mp3count;
        if (mp3buffer_size == 0)
          mp3buffer_size_remaining = 0;
        imp3 = this.lame_encode_buffer(
          gfp,
          buffer[0],
          buffer[1],
          bunch,
          mp3buffer,
          mp3bufferPos,
          mp3buffer_size_remaining
        );
        mp3bufferPos += imp3;
        mp3count += imp3;
        frames_left -= frame_num != gfp.frameNum ? 1 : 0;
      }
      gfc.mf_samples_to_encode = 0;
      if (imp3 < 0) {
        return imp3;
      }
      mp3buffer_size_remaining = mp3buffer_size - mp3count;
      if (mp3buffer_size == 0)
        mp3buffer_size_remaining = 0;
      bs.flush_bitstream(gfp);
      imp3 = bs.copy_buffer(
        gfc,
        mp3buffer,
        mp3bufferPos,
        mp3buffer_size_remaining,
        1
      );
      if (imp3 < 0) {
        return imp3;
      }
      mp3bufferPos += imp3;
      mp3count += imp3;
      mp3buffer_size_remaining = mp3buffer_size - mp3count;
      if (mp3buffer_size == 0)
        mp3buffer_size_remaining = 0;
      if (gfp.write_id3tag_automatic) {
        id3.id3tag_write_v1(gfp);
        imp3 = bs.copy_buffer(
          gfc,
          mp3buffer,
          mp3bufferPos,
          mp3buffer_size_remaining,
          0
        );
        if (imp3 < 0) {
          return imp3;
        }
        mp3count += imp3;
      }
      return mp3count;
    };
    this.lame_encode_buffer = function(gfp, buffer_l, buffer_r, nsamples, mp3buf, mp3bufPos, mp3buf_size) {
      var gfc = gfp.internal_flags;
      var in_buffer = [null, null];
      if (gfc.Class_ID != LAME_ID)
        return -3;
      if (nsamples == 0)
        return 0;
      update_inbuffer_size(gfc, nsamples);
      in_buffer[0] = gfc.in_buffer_0;
      in_buffer[1] = gfc.in_buffer_1;
      for (var i = 0; i < nsamples; i++) {
        in_buffer[0][i] = buffer_l[i];
        if (gfc.channels_in > 1)
          in_buffer[1][i] = buffer_r[i];
      }
      return lame_encode_buffer_sample(
        gfp,
        in_buffer[0],
        in_buffer[1],
        nsamples,
        mp3buf,
        mp3bufPos,
        mp3buf_size
      );
    };
    function calcNeeded(gfp) {
      var mf_needed = Encoder.BLKSIZE + gfp.framesize - Encoder.FFTOFFSET;
      mf_needed = Math.max(mf_needed, 512 + gfp.framesize - 32);
      return mf_needed;
    }
    function lame_encode_buffer_sample(gfp, buffer_l, buffer_r, nsamples, mp3buf, mp3bufPos, mp3buf_size) {
      var gfc = gfp.internal_flags;
      var mp3size = 0, ret, i, ch, mf_needed;
      var mp3out;
      var mfbuf = [null, null];
      var in_buffer = [null, null];
      if (gfc.Class_ID != LAME_ID)
        return -3;
      if (nsamples == 0)
        return 0;
      mp3out = bs.copy_buffer(gfc, mp3buf, mp3bufPos, mp3buf_size, 0);
      if (mp3out < 0)
        return mp3out;
      mp3bufPos += mp3out;
      mp3size += mp3out;
      in_buffer[0] = buffer_l;
      in_buffer[1] = buffer_r;
      if (BitStream.NEQ(gfp.scale, 0) && BitStream.NEQ(gfp.scale, 1)) {
        for (i = 0; i < nsamples; ++i) {
          in_buffer[0][i] *= gfp.scale;
          if (gfc.channels_out == 2)
            in_buffer[1][i] *= gfp.scale;
        }
      }
      if (BitStream.NEQ(gfp.scale_left, 0) && BitStream.NEQ(gfp.scale_left, 1)) {
        for (i = 0; i < nsamples; ++i) {
          in_buffer[0][i] *= gfp.scale_left;
        }
      }
      if (BitStream.NEQ(gfp.scale_right, 0) && BitStream.NEQ(gfp.scale_right, 1)) {
        for (i = 0; i < nsamples; ++i) {
          in_buffer[1][i] *= gfp.scale_right;
        }
      }
      if (gfp.num_channels == 2 && gfc.channels_out == 1) {
        for (i = 0; i < nsamples; ++i) {
          in_buffer[0][i] = 0.5 * (in_buffer[0][i] + in_buffer[1][i]);
          in_buffer[1][i] = 0;
        }
      }
      mf_needed = calcNeeded(gfp);
      mfbuf[0] = gfc.mfbuf[0];
      mfbuf[1] = gfc.mfbuf[1];
      var in_bufferPos = 0;
      while (nsamples > 0) {
        var in_buffer_ptr = [null, null];
        var n_in = 0;
        var n_out = 0;
        in_buffer_ptr[0] = in_buffer[0];
        in_buffer_ptr[1] = in_buffer[1];
        var inOut = new InOut();
        fill_buffer(
          gfp,
          mfbuf,
          in_buffer_ptr,
          in_bufferPos,
          nsamples,
          inOut
        );
        n_in = inOut.n_in;
        n_out = inOut.n_out;
        if (gfc.findReplayGain && !gfc.decode_on_the_fly) {
          if (ga.AnalyzeSamples(
            gfc.rgdata,
            mfbuf[0],
            gfc.mf_size,
            mfbuf[1],
            gfc.mf_size,
            n_out,
            gfc.channels_out
          ) == GainAnalysis.GAIN_ANALYSIS_ERROR)
            return -6;
        }
        nsamples -= n_in;
        in_bufferPos += n_in;
        if (gfc.channels_out == 2)
          ;
        gfc.mf_size += n_out;
        if (gfc.mf_samples_to_encode < 1) {
          gfc.mf_samples_to_encode = Encoder.ENCDELAY + Encoder.POSTDELAY;
        }
        gfc.mf_samples_to_encode += n_out;
        if (gfc.mf_size >= mf_needed) {
          var buf_size = mp3buf_size - mp3size;
          if (mp3buf_size == 0)
            buf_size = 0;
          ret = lame_encode_frame(
            gfp,
            mfbuf[0],
            mfbuf[1],
            mp3buf,
            mp3bufPos,
            buf_size
          );
          if (ret < 0)
            return ret;
          mp3bufPos += ret;
          mp3size += ret;
          gfc.mf_size -= gfp.framesize;
          gfc.mf_samples_to_encode -= gfp.framesize;
          for (ch = 0; ch < gfc.channels_out; ch++)
            for (i = 0; i < gfc.mf_size; i++)
              mfbuf[ch][i] = mfbuf[ch][i + gfp.framesize];
        }
      }
      return mp3size;
    }
    function lame_encode_frame(gfp, inbuf_l, inbuf_r, mp3buf, mp3bufPos, mp3buf_size) {
      var ret = self.enc.lame_encode_mp3_frame(
        gfp,
        inbuf_l,
        inbuf_r,
        mp3buf,
        mp3bufPos,
        mp3buf_size
      );
      gfp.frameNum++;
      return ret;
    }
    function InOut() {
      this.n_in = 0;
      this.n_out = 0;
    }
    function NumUsed() {
      this.num_used = 0;
    }
    function gcd(i, j) {
      return j != 0 ? gcd(j, i % j) : i;
    }
    function blackman(x, fcn, l) {
      var wcn = Math.PI * fcn;
      x /= l;
      if (x < 0)
        x = 0;
      if (x > 1)
        x = 1;
      var x2 = x - 0.5;
      var bkwn = 0.42 - 0.5 * Math.cos(2 * x * Math.PI) + 0.08 * Math.cos(4 * x * Math.PI);
      if (Math.abs(x2) < 1e-9)
        return wcn / Math.PI;
      else
        return bkwn * Math.sin(l * wcn * x2) / (Math.PI * l * x2);
    }
    function fill_buffer_resample(gfp, outbuf, outbufPos, desired_len, inbuf, in_bufferPos, len, num_used, ch) {
      var gfc = gfp.internal_flags;
      var i, j = 0, k;
      var bpc = gfp.out_samplerate / gcd(gfp.out_samplerate, gfp.in_samplerate);
      if (bpc > LameInternalFlags.BPC)
        bpc = LameInternalFlags.BPC;
      var intratio = Math.abs(gfc.resample_ratio - Math.floor(0.5 + gfc.resample_ratio)) < 1e-4 ? 1 : 0;
      var fcn = 1 / gfc.resample_ratio;
      if (fcn > 1)
        fcn = 1;
      var filter_l = 31;
      if (0 == filter_l % 2)
        --filter_l;
      filter_l += intratio;
      var BLACKSIZE = filter_l + 1;
      if (gfc.fill_buffer_resample_init == 0) {
        gfc.inbuf_old[0] = new_float(BLACKSIZE);
        gfc.inbuf_old[1] = new_float(BLACKSIZE);
        for (i = 0; i <= 2 * bpc; ++i)
          gfc.blackfilt[i] = new_float(BLACKSIZE);
        gfc.itime[0] = 0;
        gfc.itime[1] = 0;
        for (j = 0; j <= 2 * bpc; j++) {
          var sum = 0;
          var offset = (j - bpc) / (2 * bpc);
          for (i = 0; i <= filter_l; i++)
            sum += gfc.blackfilt[j][i] = blackman(
              i - offset,
              fcn,
              filter_l
            );
          for (i = 0; i <= filter_l; i++)
            gfc.blackfilt[j][i] /= sum;
        }
        gfc.fill_buffer_resample_init = 1;
      }
      var inbuf_old = gfc.inbuf_old[ch];
      for (k = 0; k < desired_len; k++) {
        var time0;
        var joff;
        time0 = k * gfc.resample_ratio;
        j = 0 | Math.floor(time0 - gfc.itime[ch]);
        if (filter_l + j - filter_l / 2 >= len)
          break;
        var offset = time0 - gfc.itime[ch] - (j + 0.5 * (filter_l % 2));
        joff = 0 | Math.floor(offset * 2 * bpc + bpc + 0.5);
        var xvalue = 0;
        for (i = 0; i <= filter_l; ++i) {
          var j2 = 0 | i + j - filter_l / 2;
          var y;
          y = j2 < 0 ? inbuf_old[BLACKSIZE + j2] : inbuf[in_bufferPos + j2];
          xvalue += y * gfc.blackfilt[joff][i];
        }
        outbuf[outbufPos + k] = xvalue;
      }
      num_used.num_used = Math.min(len, filter_l + j - filter_l / 2);
      gfc.itime[ch] += num_used.num_used - k * gfc.resample_ratio;
      if (num_used.num_used >= BLACKSIZE) {
        for (i = 0; i < BLACKSIZE; i++)
          inbuf_old[i] = inbuf[in_bufferPos + num_used.num_used + i - BLACKSIZE];
      } else {
        var n_shift = BLACKSIZE - num_used.num_used;
        for (i = 0; i < n_shift; ++i)
          inbuf_old[i] = inbuf_old[i + num_used.num_used];
        for (j = 0; i < BLACKSIZE; ++i, ++j)
          inbuf_old[i] = inbuf[in_bufferPos + j];
      }
      return k;
    }
    function fill_buffer(gfp, mfbuf, in_buffer, in_bufferPos, nsamples, io) {
      var gfc = gfp.internal_flags;
      if (gfc.resample_ratio < 0.9999 || gfc.resample_ratio > 1.0001) {
        for (var ch = 0; ch < gfc.channels_out; ch++) {
          var numUsed = new NumUsed();
          io.n_out = fill_buffer_resample(
            gfp,
            mfbuf[ch],
            gfc.mf_size,
            gfp.framesize,
            in_buffer[ch],
            in_bufferPos,
            nsamples,
            numUsed,
            ch
          );
          io.n_in = numUsed.num_used;
        }
      } else {
        io.n_out = Math.min(gfp.framesize, nsamples);
        io.n_in = io.n_out;
        for (var i = 0; i < io.n_out; ++i) {
          mfbuf[0][gfc.mf_size + i] = in_buffer[0][in_bufferPos + i];
          if (gfc.channels_out == 2)
            mfbuf[1][gfc.mf_size + i] = in_buffer[1][in_bufferPos + i];
        }
      }
    }
  }
  function GetAudio() {
    var parse;
    var mpg;
    this.setModules = function(parse2, mpg2) {
      parse = parse2;
      mpg = mpg2;
    };
  }
  function Parse() {
    var ver;
    var id3;
    var pre;
    this.setModules = function(ver2, id32, pre2) {
      ver = ver2;
      id3 = id32;
      pre = pre2;
    };
  }
  function MPGLib() {
  }
  function ID3Tag() {
    var bits;
    var ver;
    this.setModules = function(_bits, _ver) {
      bits = _bits;
      ver = _ver;
    };
  }
  function Mp3Encoder2(channels, samplerate, kbps) {
    if (arguments.length != 3) {
      console.error("WARN: Mp3Encoder(channels, samplerate, kbps) not specified");
      channels = 1;
      samplerate = 44100;
      kbps = 128;
    }
    var lame = new Lame();
    var gaud = new GetAudio();
    var ga = new GainAnalysis();
    var bs = new BitStream();
    var p = new Presets();
    var qupvt = new QuantizePVT();
    var qu = new Quantize();
    var vbr = new VBRTag();
    var ver = new Version();
    var id3 = new ID3Tag();
    var rv = new Reservoir();
    var tak = new Takehiro();
    var parse = new Parse();
    var mpg = new MPGLib();
    lame.setModules(ga, bs, p, qupvt, qu, vbr, ver, id3, mpg);
    bs.setModules(ga, mpg, ver, vbr);
    id3.setModules(bs, ver);
    p.setModules(lame);
    qu.setModules(bs, rv, qupvt, tak);
    qupvt.setModules(tak, rv, lame.enc.psy);
    rv.setModules(bs);
    tak.setModules(qupvt);
    vbr.setModules(lame, bs, ver);
    gaud.setModules(parse, mpg);
    parse.setModules(ver, id3, p);
    var gfp = lame.lame_init();
    gfp.num_channels = channels;
    gfp.in_samplerate = samplerate;
    gfp.brate = kbps;
    gfp.mode = MPEGMode.STEREO;
    gfp.quality = 3;
    gfp.bWriteVbrTag = false;
    gfp.disable_reservoir = true;
    gfp.write_id3tag_automatic = false;
    var retcode = lame.lame_init_params(gfp);
    var maxSamples = 1152;
    var mp3buf_size = 0 | 1.25 * maxSamples + 7200;
    var mp3buf = new_byte(mp3buf_size);
    this.encodeBuffer = function(left, right) {
      if (channels == 1) {
        right = left;
      }
      if (left.length > maxSamples) {
        maxSamples = left.length;
        mp3buf_size = 0 | 1.25 * maxSamples + 7200;
        mp3buf = new_byte(mp3buf_size);
      }
      var _sz = lame.lame_encode_buffer(gfp, left, right, left.length, mp3buf, 0, mp3buf_size);
      return new Int8Array(mp3buf.subarray(0, _sz));
    };
    this.flush = function() {
      var _sz = lame.lame_encode_flush(gfp, mp3buf, 0, mp3buf_size);
      return new Int8Array(mp3buf.subarray(0, _sz));
    };
  }
  function WavHeader() {
    this.dataOffset = 0;
    this.dataLen = 0;
    this.channels = 0;
    this.sampleRate = 0;
  }
  function fourccToInt(fourcc) {
    return fourcc.charCodeAt(0) << 24 | fourcc.charCodeAt(1) << 16 | fourcc.charCodeAt(2) << 8 | fourcc.charCodeAt(3);
  }
  WavHeader.RIFF = fourccToInt("RIFF");
  WavHeader.WAVE = fourccToInt("WAVE");
  WavHeader.fmt_ = fourccToInt("fmt ");
  WavHeader.data = fourccToInt("data");
  WavHeader.readHeader = function(dataView) {
    var w = new WavHeader();
    var header = dataView.getUint32(0, false);
    if (WavHeader.RIFF != header) {
      return;
    }
    var fileLen = dataView.getUint32(4, true);
    if (WavHeader.WAVE != dataView.getUint32(8, false)) {
      return;
    }
    if (WavHeader.fmt_ != dataView.getUint32(12, false)) {
      return;
    }
    var fmtLen = dataView.getUint32(16, true);
    var pos = 16 + 4;
    switch (fmtLen) {
      case 16:
      case 18:
        w.channels = dataView.getUint16(pos + 2, true);
        w.sampleRate = dataView.getUint32(pos + 4, true);
        break;
      default:
        throw "extended fmt chunk not implemented";
    }
    pos += fmtLen;
    var data = WavHeader.data;
    var len = 0;
    while (data != header) {
      header = dataView.getUint32(pos, false);
      len = dataView.getUint32(pos + 4, true);
      if (data == header) {
        break;
      }
      pos += len + 8;
    }
    w.dataLen = len;
    w.dataOffset = pos + 8;
    return w;
  };
  L3Side.SFBMAX = Encoder.SBMAX_s * 3;
  lamejs.Mp3Encoder = Mp3Encoder2;
  lamejs.WavHeader = WavHeader;
}
lamejs();
var Mp3Encoder = lamejs.Mp3Encoder;
export {
  Mp3Encoder
};
