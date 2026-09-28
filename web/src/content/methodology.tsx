import type { ReactNode } from "react";

/**
 * Methodology content. One entry per model: what it does, why it is used,
 * inputs, assumptions, how to read it, limitations and failure modes. Written
 * as plain statements so each can be quoted on its own.
 */

export type ValidationKind = "performance" | "var" | "garch" | "simulation" | "regimes" | "factors" | "stress" | null;

export type Method = {
  slug: string;
  title: string;
  short: string;
  summary: string;
  what: ReactNode;
  why: ReactNode;
  inputs: ReactNode[];
  formula?: string;
  assumptions: ReactNode[];
  reading: ReactNode;
  limitations: ReactNode[];
  failures: ReactNode[];
  changes?: ReactNode[];
  validation: ValidationKind;
  validationIntro?: ReactNode;
  references: string[];
};

export const METHODS: Method[] = [
  {
    slug: "data",
    title: "Data and portfolio construction",
    short: "Data",
    summary: "Where the prices and factors come from, how portfolios are built, and what that leaves out.",
    what: (
      <p>
        Every analysis starts from a snapshot of adjusted daily closing prices for current S&amp;P 500 members and
        about 45 widely held ETFs, from January 2000 onward, plus the daily Fama-French research factors. A job
        rebuilds the snapshot every weeknight after the US close. Page requests never call a market data service.
      </p>
    ),
    why: (
      <p>
        A fixed nightly snapshot makes every result reproducible for a given date, keeps the site fast, and means
        the numbers on the page can be traced to one dataset.
      </p>
    ),
    inputs: [
      "Adjusted closes from Yahoo Finance: dividends and splits are reinvested, so price changes are total returns.",
      "S&P 500 membership from the open datasets/s-and-p-500-companies list.",
      "Fama-French five factors, momentum and the one-month T-bill rate (the risk-free rate) from Kenneth French's data library.",
      "A portfolio of up to 25 tickers with relative weights, carried in the page address and never stored.",
    ],
    formula: "r_p,t = Σ_i w_i · r_i,t        (weights reset to target every day)",
    assumptions: [
      "The portfolio is rebalanced to its target weights every day. Real portfolios drift between rebalances and pay costs to rebalance.",
      "Returns are simple daily returns of adjusted closes. Taxes, fees and trading costs are ignored.",
      "The analysis window starts when every holding has prices. If one holding listed recently, the whole window shortens and the page says which one.",
      "Gaps of up to five trading days (halts, exchange holidays) are filled with the last price and counted in the data notes.",
    ],
    reading: (
      <p>
        Each section shows its date range and, if a holding cut the history short, names it. A shorter window means
        fewer market conditions in the sample, so every estimate built on it is less reliable.
      </p>
    ),
    limitations: [
      <>
        <b>Survivorship bias.</b> The stock universe is today&apos;s S&amp;P 500. Companies that failed or were
        removed since 2000 are missing, so the historical returns of the universe as a whole look better than they
        were. It matters less for a hand-picked portfolio of current names, but the history of those names is still
        the history of winners.
      </>,
      "Stocks outside the S&P 500 and most funds are not available.",
      "The French factors are published with a lag of a month or two, so factor results end earlier than prices.",
    ],
    failures: [
      "A corporate action that the price source handles incorrectly shows up as a false one-day jump.",
      "If the nightly job fails, the site keeps serving the previous day's snapshot; the 'as of' date on each page shows which data is in use.",
    ],
    validation: null,
    references: [
      "Kenneth R. French, Data Library, mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html",
      "Brown, S., Goetzmann, W., Ibbotson, R. and Ross, S. (1992). Survivorship bias in performance studies. Review of Financial Studies 5(4).",
    ],
  },
  {
    slug: "performance",
    title: "Performance and risk metrics",
    short: "Performance",
    summary: "Annual return, volatility, Sharpe and Sortino ratios, drawdowns, beta and risk contributions, with bootstrap ranges.",
    what: (
      <p>
        The Overview summarizes the portfolio&apos;s history in a few standard figures and shows how much each
        figure depends on the particular days in the sample.
      </p>
    ),
    why: (
      <p>
        These are the figures most people use to compare portfolios. Showing a range next to each one makes the
        point that a ten-year history is one sample of what markets could have done, and a different decade would
        have produced different numbers.
      </p>
    ),
    inputs: ["Daily portfolio returns over the chosen window (ten years by default).", "Daily risk-free rate from the French library.", "Daily S&P 500 (SPY) returns for beta."],
    formula: `CAGR        = (Π (1 + r_t))^(252 / T) − 1
Volatility  = stdev(r_t) · √252
Sharpe      = mean(r_t − rf_t) / stdev(r_t − rf_t) · √252
Sortino     = mean(r_t − rf_t) / √mean(min(r_t − rf_t, 0)²) · √252
Beta        = cov(r_p, r_m) / var(r_m)
Risk share  = w_i (Σw)_i / (wᵀΣw)`,
    assumptions: [
      "252 trading days a year.",
      "Up-market and down-market betas are separate regressions on days when SPY rose and fell.",
      "Ranges are 90% intervals from a circular block bootstrap: the daily returns are resampled in 21-day blocks 1,000 times and each figure recomputed.",
    ],
    reading: (
      <p>
        Read a range as &quot;with a different draw of days of the same character, this figure could plausibly have
        been anywhere in here.&quot; A Sharpe ratio range that spans zero means the history cannot tell this
        portfolio&apos;s risk-adjusted return apart from cash.
      </p>
    ),
    limitations: [
      "Bootstrap ranges only reshuffle the days in the sample. They cannot show regimes the sample never saw.",
      "Maximum drawdown depends heavily on whether a crash is inside the window.",
      "Risk shares use the sample covariance matrix, which is noisy for many holdings over short windows.",
    ],
    failures: ["With fewer than about two years of data, the ranges become very wide and the point figures are close to meaningless."],
    changes: [
      "Annual return is now compounded (CAGR) rather than the average day compounded 252 times, which overstates growth when returns vary.",
      "Sharpe and Sortino use the daily T-bill rate instead of a fixed 4%.",
      "Sortino uses downside deviation over all days, the standard definition.",
      "Up and down betas are regression slopes rather than ratios of average returns.",
    ],
    validation: "performance",
    validationIntro: "Point estimates and 90% bootstrap ranges for the three example portfolios, from the current snapshot.",
    references: [
      "Sharpe, W. F. (1994). The Sharpe ratio. Journal of Portfolio Management 21(1).",
      "Sortino, F. and Price, L. (1994). Performance measurement in a downside risk framework. Journal of Investing 3(3).",
      "Lo, A. W. (2002). The statistics of Sharpe ratios. Financial Analysts Journal 58(4).",
      "Politis, D. and Romano, J. (1994). The stationary bootstrap. JASA 89(428).",
    ],
  },
  {
    slug: "value-at-risk",
    title: "Value at Risk and backtesting",
    short: "Value at Risk",
    summary: "One-day VaR and expected shortfall by three methods, and an out-of-sample test of whether they held up.",
    what: (
      <p>
        Value at Risk (VaR) at 95% is the one-day loss that is exceeded on only 5% of days. Expected shortfall (ES)
        is the average loss on those 5% of days. The Risk section estimates both three ways and then checks each
        method against what actually happened.
      </p>
    ),
    why: (
      <p>
        VaR is the most widely used single number for short-term downside risk, and also one of the most criticized.
        Showing three methods side by side, with a backtest, turns it from a single confident figure into a
        comparison of assumptions.
      </p>
    ),
    inputs: ["Daily portfolio returns (ten years by default).", "For filtered historical simulation, a GARCH(1,1) fit to those returns."],
    formula: `Historical:           VaR = −quantile(r, 1 − c)
Parametric (normal):  VaR = −σ · Φ⁻¹(1 − c)            ES = σ · φ(Φ⁻¹(1 − c)) / (1 − c)
Filtered historical:  z_t = (r_t − μ) / σ_t              VaR = −(μ + σ_T+1 · quantile(z, 1 − c))
Kupiec LR   = −2 ln[(1−p)^(T−x) p^x] + 2 ln[(1−x/T)^(T−x) (x/T)^x]      ~ χ²(1)`,
    assumptions: [
      "Historical simulation assumes the past window's distribution of daily returns applies tomorrow, with every day weighted equally.",
      "The parametric method assumes normally distributed returns with zero mean.",
      "Filtered historical simulation assumes the GARCH model captures how volatility changes, and that the standardized residuals are drawn from a stable distribution whose shape the history reveals.",
      "Holdings are held for one day at their current weights.",
    ],
    reading: (
      <p>
        The headline uses filtered historical simulation because it reacts to current volatility while keeping the
        fat tails of real returns. When the three methods disagree, that disagreement is informative: a high
        parametric figure relative to historical usually means recent volatility is high; a high historical figure
        relative to parametric usually means fat tails. In the backtest, a 95% VaR should be breached on about 5%
        of days, and breaches should not arrive in clusters.
      </p>
    ),
    limitations: [
      "VaR says nothing about how large losses are beyond the threshold. Expected shortfall is shown for that reason.",
      "One-day figures do not scale simply to longer horizons when volatility clusters.",
      "The backtest covers about three years, so it contains roughly 38 expected breaches at 95% and fewer than 8 at 99%: enough to catch badly wrong models, not subtle ones.",
    ],
    failures: [
      "All three methods fail when tomorrow is worse than anything in the estimation window. In February 2020, a VaR estimated on the calm prior year was badly exceeded.",
      "The parametric method understates tail losses for assets with fat tails or skew.",
      "Historical simulation is slow to react: a volatile period enters and leaves the window abruptly.",
    ],
    changes: [
      "The original version's third method drew random numbers from a normal distribution with the sample mean and volatility, which reproduced the parametric result with simulation noise. It is replaced by filtered historical simulation.",
      "The backtest (Kupiec and Christoffersen tests) is new.",
    ],
    validation: "var",
    validationIntro: "Out-of-sample 95% VaR backtests for the example portfolios over the last three years of the current snapshot. Each forecast uses only data available before that day; GARCH is refitted every 21 trading days on a trailing 1,000-day window.",
    references: [
      "Jorion, P. (2007). Value at Risk, 3rd ed. McGraw-Hill.",
      "Barone-Adesi, G., Giannopoulos, K. and Vosper, L. (1999). VaR without correlations for portfolios of derivative securities. Journal of Futures Markets 19(5).",
      "Kupiec, P. (1995). Techniques for verifying the accuracy of risk measurement models. Journal of Derivatives 3(2).",
      "Christoffersen, P. (1998). Evaluating interval forecasts. International Economic Review 39(4).",
      "Artzner, P., Delbaen, F., Eber, J.-M. and Heath, D. (1999). Coherent measures of risk. Mathematical Finance 9(3).",
    ],
  },
  {
    slug: "garch",
    title: "GARCH(1,1) volatility forecasting",
    short: "GARCH volatility",
    summary: "How volatile the portfolio is now, where the model expects volatility to go, and whether the model fits.",
    what: (
      <p>
        GARCH(1,1) estimates today&apos;s volatility from yesterday&apos;s volatility and yesterday&apos;s
        surprise, then projects it forward. Volatility forecasts drift back toward a long-run level at a speed the
        model estimates from the data.
      </p>
    ),
    why: (
      <p>
        Market volatility clusters: turbulent days follow turbulent days. A single long-run volatility figure
        ignores that. GARCH is the standard, well-understood model of it and needs only the return history.
      </p>
    ),
    inputs: ["Daily portfolio returns (ten years by default); each holding is also fitted on its own."],
    formula: `σ²_t   = ω + α · ε²_t−1 + β · σ²_t−1
σ²_T+k = V_L + (α + β)^(k−1) · (σ²_T+1 − V_L),      V_L = ω / (1 − α − β)
k-day average volatility = √( mean(σ²_T+1 … σ²_T+k) · 252 )`,
    assumptions: [
      "Returns are fitted with a constant mean and normal quasi-likelihood. The normality is only used for estimation; the fitted parameters stay valid under fat tails.",
      "Positive and negative shocks raise volatility equally. In practice, falls raise it more (the leverage effect), which this model does not capture.",
      "Parameters are constant over the estimation window.",
    ],
    reading: (
      <p>
        The 21-day forecast is the average volatility expected over the next 21 trading days, which is the right
        input for anything that spans the whole period. The forecast for day 21 alone would overstate it when
        volatility is falling and understate it when rising. Persistence (α + β) close to 1 means shocks fade
        slowly; the half-life is how long it takes for half of a shock to fade.
      </p>
    ),
    limitations: [
      "The model reacts only after returns move. It does not anticipate scheduled events or news.",
      "With persistence near 1, long-horizon forecasts depend heavily on a long-run level that is itself uncertain.",
    ],
    failures: [
      <>
        If the optimizer returns a degenerate fit (α near 0 with β near 1), fails to converge, or implies
        non-stationary volatility, the engine falls back to an exponentially weighted average with λ = 0.94
        (RiskMetrics) and says so. That fallback&apos;s forecast is flat.
      </>,
      "A Ljung-Box test on squared standardized residuals with a p-value below 0.05 means volatility clustering remains that the model did not capture.",
    ],
    changes: [
      "The original version reported the day-21 forecast as the '21-day forecast'. It is now the average over the 21 days, and both are shown.",
      "Residual diagnostics (Ljung-Box) are new.",
      "The fallback forecast is now flat, as EWMA implies, rather than blended toward a long-run level.",
    ],
    validation: "garch",
    validationIntro: "Fitted parameters and residual diagnostics for the example portfolios from the current snapshot.",
    references: [
      "Engle, R. (1982). Autoregressive conditional heteroscedasticity. Econometrica 50(4).",
      "Bollerslev, T. (1986). Generalized autoregressive conditional heteroskedasticity. Journal of Econometrics 31(3).",
      "J.P. Morgan/Reuters (1996). RiskMetrics Technical Document, 4th ed.",
      "Ljung, G. and Box, G. (1978). On a measure of lack of fit in time series models. Biometrika 65(2).",
    ],
  },
  {
    slug: "monte-carlo",
    title: "Block-bootstrap Monte Carlo",
    short: "Monte Carlo",
    summary: "Thousands of simulated futures built from stretches of real history, and what they can and cannot tell you.",
    what: (
      <p>
        Each simulated path strings together randomly chosen runs of consecutive historical days (21 by default)
        until it reaches the horizon. With 5,000 paths, the spread of ending values shows the range of outcomes the
        portfolio&apos;s own history supports.
      </p>
    ),
    why: (
      <p>
        Resampling real days keeps the fat tails and the co-movement between holdings that a normal-distribution
        simulation loses. Resampling runs of days, rather than single days, also keeps volatility clustering, so
        simulated crashes last as long as real ones did.
      </p>
    ),
    inputs: ["Daily portfolio returns (fifteen years by default).", "Horizon, expected-return mode and block length, all adjustable."],
    formula: `path value_k = 10,000 · Π_{t ≤ k} (1 + r*_t),   r* drawn in blocks of L consecutive historical days
zero mode:     r*_t drawn from (r_t − mean(r))`,
    assumptions: [
      "The future looks like the sample: only days that occurred can occur again, in new orders.",
      "Blocks wrap around the end of the sample (circular bootstrap).",
      "The 'historical' mode uses the sample's average return. The 'zero' mode removes it, because average returns are the least reliably estimated input and dominate long horizons.",
      "Daily rebalancing; no fees, taxes, contributions or withdrawals.",
    ],
    reading: (
      <p>
        The shaded bands contain the middle 50% and 90% of paths. The median path is not a forecast. Switching to
        zero expected return shows how much of the picture comes from the assumed return rather than from risk. The
        ± figures next to probabilities are simulation error from the finite number of paths, not uncertainty about
        markets.
      </p>
    ),
    limitations: [
      "No loss worse than the worst stretch in the sample is possible.",
      "A fifteen-year sample includes one or two severe crises; the simulated frequency of crises inherits that.",
      "Block length is a judgment call: longer blocks keep more dependence but produce less varied paths.",
    ],
    failures: [
      "If the sample is dominated by one strong trend, the historical mode projects that trend forward. The zero mode exists to expose this.",
    ],
    changes: [
      "The original version resampled single days, which destroys volatility clustering. It now resamples 21-day blocks by default.",
      "The zero-return toggle, longer lookback and printed assumptions are new.",
    ],
    validation: "simulation",
    validationIntro: "How the block length changes the simulated spread for the Balanced example (one-year horizon).",
    references: [
      "Künsch, H. (1989). The jackknife and the bootstrap for general stationary observations. Annals of Statistics 17(3).",
      "Politis, D. and Romano, J. (1992). A circular block-resampling procedure for stationary data. In Exploring the Limits of Bootstrap, Wiley.",
      "Efron, B. and Tibshirani, R. (1993). An Introduction to the Bootstrap. Chapman & Hall.",
    ],
  },
  {
    slug: "regimes",
    title: "Hidden Markov model regimes",
    short: "Market regimes",
    summary: "A four-state model of the S&P 500 that labels each period calm, normal, volatile or crisis, using only data available at the time.",
    what: (
      <p>
        A hidden Markov model assumes the market moves between a few unobserved states, each with its own typical
        returns and volatility, and switches between them with fixed probabilities. The model is fitted to three
        features of the S&amp;P 500: its 20-day average return, 20-day volatility and 60-day average return.
      </p>
    ),
    why: (
      <p>
        Risk figures averaged over all market conditions hide how differently a portfolio behaves in calm and
        turbulent periods. Regimes give a data-driven way to split history and ask how this portfolio did in each.
      </p>
    ),
    inputs: ["Daily SPY returns since 2000.", "The portfolio's daily returns, only for the per-regime performance table."],
    formula: `filtered probability:  P(s_t | x_1 … x_t) ∝ p(x_t | s_t) · Σ_j P(s_t | s_t−1 = j) · P(s_t−1 = j | x_1 … x_t−1)
confidence shown:      min(p_max, 0.95), excess spread across the other states in proportion`,
    assumptions: [
      "Four states, each a multivariate normal distribution of the three features.",
      "Constant transition probabilities.",
      "Model parameters are estimated once on the full sample. The label at each date uses only features up to that date, but the parameters that turn features into labels have seen the whole history.",
      "States are named by their average 20-day volatility, lowest to highest.",
    ],
    reading: (
      <p>
        The stacked chart shows, for each week, how probable each state looked at the time. The current reading
        never shows more than 95% confidence: the model&apos;s raw probabilities are often near 100%, which
        overstates how sure anyone can be about an unobservable state. Expected durations come from the transition
        probabilities.
      </p>
    ),
    limitations: [
      "Regimes are descriptive. A regime label says what recent volatility and trend look like, not what comes next.",
      "Features are backward-looking 20- and 60-day windows, so the model recognizes a change weeks after it starts.",
      "Four states is a modeling choice. More states fit better and mean less.",
    ],
    failures: [
      <>
        The fit depends on its random starting point. On the current data, the original model&apos;s fixed seed
        landed on a clearly worse fit (lower likelihood) whose labels agreed with the best fit on only about a third
        of days. The engine now fits from eight starting points, keeps the most likely, and reports how well the
        runners-up agree.
      </>,
      <>
        The original model named states bull, bear, recovery and crisis by their average same-day return. On this
        data every non-crisis state has a positive average return, so &quot;bear&quot; meant the lowest of three
        positive returns and flipped between fits that were otherwise identical. The states differ mainly in
        volatility, and are now named that way.
      </>,
      "If the HMM fails to fit, a Gaussian mixture without time dynamics is used instead and labeled as such.",
    ],
    changes: [
      "Labels use forward-filtered probabilities instead of the most likely path and smoothed probabilities, which used future data.",
      "Best of eight random starts; stability across starts is reported.",
      "States renamed by volatility rank.",
      "A feature that was an exact multiple of another (annualized and daily 20-day volatility) was removed; it made the covariance matrices singular.",
    ],
    validation: "regimes",
    validationIntro: "Agreement between the best fit and the other random starts, from the nightly fit on the current snapshot.",
    references: [
      "Hamilton, J. (1989). A new approach to the economic analysis of nonstationary time series and the business cycle. Econometrica 57(2).",
      "Rabiner, L. (1989). A tutorial on hidden Markov models and selected applications in speech recognition. Proceedings of the IEEE 77(2).",
      "Ang, A. and Timmermann, A. (2012). Regime changes and financial markets. Annual Review of Financial Economics 4.",
    ],
  },
  {
    slug: "factors",
    title: "Fama-French five-factor plus momentum regression",
    short: "Factor exposures",
    summary: "Which well-known sources of return the portfolio is exposed to, with honest standard errors.",
    what: (
      <p>
        The portfolio&apos;s daily return above the T-bill rate is regressed on six factor returns: the market, size
        (small minus big), value (high minus low book-to-market), profitability (robust minus weak), investment
        (conservative minus aggressive) and momentum (recent winners minus losers). The coefficients are the
        portfolio&apos;s exposures, or loadings.
      </p>
    ),
    why: (
      <p>
        Two portfolios with the same volatility can be exposed to completely different things. Factor loadings say
        what kind of stocks the portfolio behaves like, and how much of its return those exposures explain.
      </p>
    ),
    inputs: ["Daily portfolio returns over the last five years.", "Daily factor returns and the risk-free rate from the French library."],
    formula: `r_p,t − rf_t = α + β_M·MKT_t + β_S·SMB_t + β_V·HML_t + β_P·RMW_t + β_I·CMA_t + β_U·MOM_t + ε_t
Newey-West lags = ⌊4 (T/100)^(2/9)⌋        VIF_k = 1 / (1 − R²_k)`,
    assumptions: [
      "Loadings are constant over the window. The rolling chart shows how far that is from true.",
      "The relationship is linear.",
      "Newey-West (HAC) standard errors allow for autocorrelation and changing volatility in the residuals.",
    ],
    reading: (
      <p>
        A market loading of 1 means the portfolio moves one-for-one with the market after other factors are
        accounted for. Loadings whose 95% interval includes zero are shown in grey: the data cannot tell them apart
        from no exposure. Alpha is the average return the factors do not explain; its interval is almost always
        wide. The variance inflation factor (VIF) flags factors that move together in this sample; above 5, their
        separate loadings are unreliable.
      </p>
    ),
    limitations: [
      "The factors are built from US stocks. For bonds, gold or foreign stocks the loadings are harder to interpret and R² is lower.",
      "Factor data is published with a one-to-two-month lag.",
      "Daily data can understate loadings for holdings that trade infrequently or in other time zones.",
    ],
    failures: ["For portfolios with few stocks, the unexplained part is large and loadings move a lot from year to year."],
    changes: [
      "The original version regressed on six ETFs (SPY, IWM, IVE, MTUM, QUAL, QQQ). All hold large US stocks and move closely together, so their coefficients were unstable. The French factors are long-short portfolios designed to be close to independent.",
      "Newey-West standard errors and the VIF check are new.",
    ],
    validation: "factors",
    validationIntro: "Fit and collinearity for the example portfolios from the current snapshot.",
    references: [
      "Fama, E. and French, K. (2015). A five-factor asset pricing model. Journal of Financial Economics 116(1).",
      "Carhart, M. (1997). On persistence in mutual fund performance. Journal of Finance 52(1).",
      "Newey, W. and West, K. (1987). A simple, positive semi-definite, heteroskedasticity and autocorrelation consistent covariance matrix. Econometrica 55(3).",
      "Newey, W. and West, K. (1994). Automatic lag selection in covariance matrix estimation. Review of Economic Studies 61(4).",
    ],
  },
  {
    slug: "stress-tests",
    title: "Historical replay and custom shocks",
    short: "Stress tests",
    summary: "What history's worst market declines would have done to the portfolio, and a simple linear shock model.",
    what: (
      <p>
        For each of seven crises, from the dot-com bust to the 2025 tariff shock, the portfolio is bought at the
        S&amp;P 500&apos;s peak and held to its trough, using each holding&apos;s actual daily returns over that
        window. The custom shock applies a move in the stock market and in interest rates through each
        holding&apos;s estimated sensitivities.
      </p>
    ),
    why: (
      <p>
        Volatility and VaR describe ordinary bad days. Crises are different: correlations rise and losses compound.
        Replaying real episodes shows the path, not just the endpoint, and needs no distributional assumption.
      </p>
    ),
    inputs: [
      "Full price history of each holding and SPY.",
      "For holdings that did not trade during a crisis: their beta to SPY from their first three years of trading.",
      "For custom shocks: each holding's regression on SPY and IEF (7–10 year Treasuries) over the last three years.",
    ],
    formula: `replay:        R_p = Σ_i w_i · (P_i,trough / P_i,peak − 1)       (buy and hold, starting weights)
beta-scaled:   r_i,t = β_i · r_SPY,t      for holdings not yet trading
custom shock:  move_i = β_M,i · market_move + β_T,i · (−7.5 · Δyield)`,
    assumptions: [
      "Windows run from the S&P 500's closing high to its closing low; a holding could have fallen further on other dates.",
      "No rebalancing inside the window.",
      "Custom shocks are instantaneous and linear, and IEF's duration is taken as 7.5 years.",
    ],
    reading: (
      <p>
        The comparison against the S&amp;P 500 answers &quot;compared to what?&quot;. Each holding is labeled with
        the method used: actual returns, or beta-scaled when it did not exist yet. The share of weight replayed with
        actual data is shown for every scenario; below 100%, treat the result as an estimate.
      </p>
    ),
    limitations: [
      "Most ETFs did not exist in 2000, so portfolios of ETFs are largely beta-scaled in the dot-com scenario. Beta-scaling assumes the holding behaved like a leveraged S&P 500, which misses anything specific to it: bonds and gold, for example, rose in several of these crises.",
      "Seven episodes are not a distribution. The next crisis will differ.",
      "Custom shocks ignore changes in correlation during stress, which is when diversification tends to fail.",
    ],
    failures: ["For a holding with a short history, its estimated beta is noisy and the beta-scaled result inherits that noise."],
    changes: [
      "The original version scaled SPY's move by each holding's beta and a hand-set sector multiplier for every holding. It now replays actual returns wherever they exist.",
      "The 'recovery days' estimate (loss × 200) is removed; it had no basis.",
      "Hardcoded custom scenarios are replaced by sliders with the assumptions shown.",
    ],
    validation: "stress",
    validationIntro: "Share of each example portfolio's weight replayed with actual data, by scenario.",
    references: [
      "Basel Committee on Banking Supervision (2018). Stress testing principles.",
      "Kupiec, P. (1998). Stress testing in a value at risk framework. Journal of Derivatives 6(1).",
    ],
  },
];

export function getMethod(slug: string): Method | undefined {
  return METHODS.find((m) => m.slug === slug);
}
